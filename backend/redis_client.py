# backend/redis_client.py
"""
Redis Client for ResidencyFlow
================================
Handles: Job queue, caching, rate limiting, distributed locks

Architecture:
- Job queue: Background tasks (email, webhooks, cleanup)
- Caching: API responses, connector configs, pipeline metadata
- Rate limiting: Per-tenant API throttling
- Distributed locks: Prevent concurrent pipeline runs

Performance:
- <1ms for cache hits
- Tenant-isolated keys: tenant:{tenant_id}:*
- TTL-based expiration for automatic cleanup
"""

import redis
import json
import hashlib
import os
from typing import Optional, Dict, Any, List
from datetime import timedelta
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)

# Redis configuration
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")
REDIS_DB = int(os.getenv("REDIS_DB", "0"))

# Connection pool for better performance
redis_pool = redis.ConnectionPool(
    host=REDIS_HOST,
    port=REDIS_PORT,
    password=REDIS_PASSWORD if REDIS_PASSWORD else None,
    db=REDIS_DB,
    decode_responses=True,
    max_connections=50
)


class RedisClient:
    """
    Production-ready Redis client with multi-tenant support.
    
    Features:
    - Tenant-isolated keys
    - Automatic serialization/deserialization
    - TTL management
    - Connection pooling
    - Error handling with fallbacks
    """
    
    def __init__(self):
        self.client = redis.Redis(connection_pool=redis_pool)
        self._test_connection()
    
    def _test_connection(self):
        """Test Redis connection on initialization"""
        try:
            self.client.ping()
            logger.info(f"✅ Redis connected: {REDIS_HOST}:{REDIS_PORT}")
        except redis.ConnectionError as e:
            logger.error(f"❌ Redis connection failed: {e}")
            raise
    
    def _tenant_key(self, tenant_id: str, key: str) -> str:
        """
        Generate tenant-isolated Redis key.
        
        Pattern: tenant:{tenant_id}:{key}
        Example: tenant:org-123:pipeline:abc:metadata
        """
        return f"tenant:{tenant_id}:{key}"
    
    # ========================================================================
    # CACHING
    # ========================================================================
    
    def cache_set(
        self,
        tenant_id: str,
        key: str,
        value: Any,
        ttl: int = 3600
    ) -> bool:
        """
        Set cache value with TTL.
        
        Args:
            tenant_id: Organization UUID
            key: Cache key (e.g., "pipeline:abc:metadata")
            value: Any JSON-serializable value
            ttl: Time to live in seconds (default: 1 hour)
        
        Returns:
            True if successful
        """
        try:
            redis_key = self._tenant_key(tenant_id, key)
            serialized = json.dumps(value)
            self.client.setex(redis_key, ttl, serialized)
            logger.debug(f"Cache SET: {redis_key} (TTL: {ttl}s)")
            return True
        except Exception as e:
            logger.error(f"Cache SET failed: {e}")
            return False
    
    def cache_get(self, tenant_id: str, key: str) -> Optional[Any]:
        """
        Get cache value.
        
        Args:
            tenant_id: Organization UUID
            key: Cache key
        
        Returns:
            Cached value or None if not found/expired
        """
        try:
            redis_key = self._tenant_key(tenant_id, key)
            value = self.client.get(redis_key)
            if value:
                logger.debug(f"Cache HIT: {redis_key}")
                return json.loads(value)
            logger.debug(f"Cache MISS: {redis_key}")
            return None
        except Exception as e:
            logger.error(f"Cache GET failed: {e}")
            return None
    
    def cache_delete(self, tenant_id: str, key: str) -> bool:
        """Delete cache entry"""
        try:
            redis_key = self._tenant_key(tenant_id, key)
            self.client.delete(redis_key)
            logger.debug(f"Cache DELETE: {redis_key}")
            return True
        except Exception as e:
            logger.error(f"Cache DELETE failed: {e}")
            return False
    
    def cache_invalidate_pattern(self, tenant_id: str, pattern: str) -> int:
        """
        Invalidate all cache keys matching pattern.
        
        Example:
            cache_invalidate_pattern("org-123", "pipeline:*")
            Deletes: tenant:org-123:pipeline:abc, tenant:org-123:pipeline:def, etc.
        """
        try:
            redis_pattern = self._tenant_key(tenant_id, pattern)
            keys = self.client.keys(redis_pattern)
            if keys:
                deleted = self.client.delete(*keys)
                logger.info(f"Cache invalidated: {deleted} keys matching {redis_pattern}")
                return deleted
            return 0
        except Exception as e:
            logger.error(f"Cache invalidation failed: {e}")
            return 0
    
    # ========================================================================
    # RATE LIMITING
    # ========================================================================
    
    def rate_limit_check(
        self,
        tenant_id: str,
        action: str,
        limit: int = 100,
        window: int = 60
    ) -> Dict[str, Any]:
        """
        Check if action is rate limited (token bucket algorithm).
        
        Args:
            tenant_id: Organization UUID
            action: Action identifier (e.g., "api:create_pipeline")
            limit: Max requests per window
            window: Time window in seconds
        
        Returns:
            {
                "allowed": bool,
                "remaining": int,
                "reset_at": int (timestamp)
            }
        """
        try:
            key = self._tenant_key(tenant_id, f"ratelimit:{action}")
            
            # Use Redis pipeline for atomic operations
            pipe = self.client.pipeline()
            now = int(self.client.time()[0])  # Redis server time
            
            # Increment counter
            pipe.incr(key)
            pipe.ttl(key)
            results = pipe.execute()
            
            count = results[0]
            ttl = results[1]
            
            # Set TTL if this is first request
            if ttl == -1:
                self.client.expire(key, window)
                ttl = window
            
            allowed = count <= limit
            remaining = max(0, limit - count)
            reset_at = now + ttl
            
            if not allowed:
                logger.warning(f"Rate limit exceeded: {tenant_id} {action} ({count}/{limit})")
            
            return {
                "allowed": allowed,
                "remaining": remaining,
                "reset_at": reset_at,
                "limit": limit
            }
        
        except Exception as e:
            logger.error(f"Rate limit check failed: {e}")
            # Fail open - allow request if Redis is down
            return {"allowed": True, "remaining": limit, "reset_at": 0, "limit": limit}
    
    # ========================================================================
    # DISTRIBUTED LOCKS
    # ========================================================================
    
    @contextmanager
    def lock(
        self,
        tenant_id: str,
        resource: str,
        timeout: int = 10,
        blocking_timeout: int = 5
    ):
        """
        Distributed lock context manager.
        
        Prevents concurrent operations on same resource (e.g., pipeline runs).
        
        Usage:
            with redis_client.lock("org-123", "pipeline:abc:run"):
                # Only one worker can execute this at a time
                run_pipeline()
        
        Args:
            tenant_id: Organization UUID
            resource: Resource identifier
            timeout: Lock expiration in seconds (prevents deadlocks)
            blocking_timeout: Max time to wait for lock acquisition
        
        Raises:
            redis.exceptions.LockError: If lock cannot be acquired
        """
        lock_key = self._tenant_key(tenant_id, f"lock:{resource}")
        lock_obj = self.client.lock(
            lock_key,
            timeout=timeout,
            blocking_timeout=blocking_timeout
        )
        
        try:
            acquired = lock_obj.acquire()
            if not acquired:
                raise redis.exceptions.LockError(f"Could not acquire lock: {lock_key}")
            logger.debug(f"Lock ACQUIRED: {lock_key}")
            yield lock_obj
        finally:
            try:
                lock_obj.release()
                logger.debug(f"Lock RELEASED: {lock_key}")
            except redis.exceptions.LockError:
                # Lock already expired/released
                pass
    
    # ========================================================================
    # JOB QUEUE
    # ========================================================================
    
    def enqueue_job(
        self,
        tenant_id: str,
        job_type: str,
        payload: Dict[str, Any],
        priority: int = 1
    ) -> Optional[str]:
        """
        Add job to queue for background processing.
        
        Queue structure: Sorted set with priority + timestamp
        
        Args:
            tenant_id: Organization UUID
            job_type: Job type (e.g., "email", "webhook", "cleanup")
            payload: Job data (must be JSON-serializable)
            priority: Higher = processed first (1-10, default: 1)
        
        Returns:
            Job ID or None if failed
        """
        try:
            import time
            import uuid
            
            job_id = str(uuid.uuid4())
            job_data = {
                "id": job_id,
                "tenant_id": tenant_id,
                "type": job_type,
                "payload": payload,
                "created_at": time.time(),
                "status": "pending"
            }
            
            # Store job data
            job_key = self._tenant_key(tenant_id, f"job:{job_id}")
            self.client.setex(job_key, 86400, json.dumps(job_data))  # 24h TTL
            
            # Add to queue (sorted set: score = priority + timestamp)
            queue_key = self._tenant_key(tenant_id, f"queue:{job_type}")
            score = priority * 1e10 + time.time()  # Higher priority first
            self.client.zadd(queue_key, {job_id: score})
            
            logger.info(f"Job enqueued: {job_type} {job_id} (tenant: {tenant_id})")
            return job_id
        
        except Exception as e:
            logger.error(f"Job enqueue failed: {e}")
            return None
    
    def dequeue_job(self, tenant_id: str, job_type: str) -> Optional[Dict[str, Any]]:
        """
        Get next job from queue (highest priority first).
        
        Args:
            tenant_id: Organization UUID
            job_type: Job type to dequeue
        
        Returns:
            Job data dict or None if queue empty
        """
        try:
            queue_key = self._tenant_key(tenant_id, f"queue:{job_type}")
            
            # Get highest priority job (ZPOPMAX for Redis 5.0+)
            result = self.client.zpopmax(queue_key, 1)
            if not result:
                return None
            
            job_id, _ = result[0]
            
            # Get job data
            job_key = self._tenant_key(tenant_id, f"job:{job_id}")
            job_data = self.client.get(job_key)
            if job_data:
                return json.loads(job_data)
            
            return None
        
        except Exception as e:
            logger.error(f"Job dequeue failed: {e}")
            return None
    
    def get_queue_length(self, tenant_id: str, job_type: str) -> int:
        """Get number of pending jobs in queue"""
        try:
            queue_key = self._tenant_key(tenant_id, f"queue:{job_type}")
            return self.client.zcard(queue_key)
        except Exception as e:
            logger.error(f"Queue length check failed: {e}")
            return 0
    
    # ========================================================================
    # SESSION MANAGEMENT
    # ========================================================================
    
    def set_session(self, session_id: str, data: Dict[str, Any], ttl: int = 3600) -> bool:
        """
        Store session data (e.g., temporary auth tokens, CSRF tokens).
        
        Args:
            session_id: Session identifier
            data: Session data
            ttl: Session lifetime in seconds (default: 1 hour)
        """
        try:
            key = f"session:{session_id}"
            self.client.setex(key, ttl, json.dumps(data))
            return True
        except Exception as e:
            logger.error(f"Session set failed: {e}")
            return False
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session data"""
        try:
            key = f"session:{session_id}"
            data = self.client.get(key)
            return json.loads(data) if data else None
        except Exception as e:
            logger.error(f"Session get failed: {e}")
            return None
    
    def delete_session(self, session_id: str) -> bool:
        """Delete session"""
        try:
            key = f"session:{session_id}"
            self.client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Session delete failed: {e}")
            return False
    
    # ========================================================================
    # METRICS & MONITORING
    # ========================================================================
    
    def increment_counter(self, tenant_id: str, metric: str, amount: int = 1) -> int:
        """
        Increment counter metric.
        
        Example: Track API calls, pipeline runs, errors
        """
        try:
            key = self._tenant_key(tenant_id, f"metric:{metric}")
            return self.client.incrby(key, amount)
        except Exception as e:
            logger.error(f"Counter increment failed: {e}")
            return 0
    
    def get_counter(self, tenant_id: str, metric: str) -> int:
        """Get counter value"""
        try:
            key = self._tenant_key(tenant_id, f"metric:{metric}")
            value = self.client.get(key)
            return int(value) if value else 0
        except Exception as e:
            logger.error(f"Counter get failed: {e}")
            return 0
    
    def reset_counter(self, tenant_id: str, metric: str) -> bool:
        """Reset counter to zero"""
        try:
            key = self._tenant_key(tenant_id, f"metric:{metric}")
            self.client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Counter reset failed: {e}")
            return False
    
    # ========================================================================
    # HEALTH CHECK
    # ========================================================================
    
    def health_check(self) -> Dict[str, Any]:
        """
        Check Redis health and return stats.
        
        Returns:
            {
                "status": "healthy|unhealthy",
                "ping": bool,
                "used_memory": str,
                "connected_clients": int,
                "keys": int
            }
        """
        try:
            # Ping test
            ping_ok = self.client.ping()
            
            # Get server info
            info = self.client.info()
            
            return {
                "status": "healthy" if ping_ok else "unhealthy",
                "ping": ping_ok,
                "used_memory": info.get("used_memory_human", "unknown"),
                "connected_clients": info.get("connected_clients", 0),
                "keys": self.client.dbsize(),
                "uptime_seconds": info.get("uptime_in_seconds", 0)
            }
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {
                "status": "unhealthy",
                "error": str(e)
            }


# ============================================================================
# SINGLETON INSTANCE
# ============================================================================

redis_client = RedisClient()


# ============================================================================
# HELPER DECORATORS
# ============================================================================

def cached(tenant_id_arg: str = "tenant_id", ttl: int = 3600, key_prefix: str = ""):
    """
    Decorator for caching function results.
    
    Usage:
        @cached(tenant_id_arg="org_id", ttl=300, key_prefix="pipeline")
        def get_pipeline_metadata(org_id: str, pipeline_id: str):
            # Expensive database query
            return db.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
    
    Cache key: tenant:{org_id}:pipeline:get_pipeline_metadata:{pipeline_id}
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            # Extract tenant_id from args
            import inspect
            sig = inspect.signature(func)
            bound = sig.bind(*args, **kwargs)
            bound.apply_defaults()
            
            tenant_id = bound.arguments.get(tenant_id_arg)
            if not tenant_id:
                # No tenant_id, skip caching
                return func(*args, **kwargs)
            
            # Generate cache key
            func_name = func.__name__
            cache_key_parts = [key_prefix, func_name] if key_prefix else [func_name]
            
            # Add function arguments to key (except tenant_id)
            for k, v in bound.arguments.items():
                if k != tenant_id_arg:
                    cache_key_parts.append(f"{k}:{v}")
            
            cache_key = ":".join(cache_key_parts)
            
            # Try cache first
            cached_value = redis_client.cache_get(tenant_id, cache_key)
            if cached_value is not None:
                return cached_value
            
            # Cache miss - call function
            result = func(*args, **kwargs)
            
            # Cache result
            redis_client.cache_set(tenant_id, cache_key, result, ttl)
            
            return result
        
        return wrapper
    return decorator


def rate_limited(limit: int = 100, window: int = 60, tenant_id_arg: str = "tenant_id"):
    """
    Decorator for rate limiting.
    
    Usage:
        @rate_limited(limit=10, window=60, tenant_id_arg="org_id")
        def create_pipeline(org_id: str, pipeline_data: dict):
            # Only 10 calls per minute per organization
            pass
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            import inspect
            from fastapi import HTTPException
            
            sig = inspect.signature(func)
            bound = sig.bind(*args, **kwargs)
            bound.apply_defaults()
            
            tenant_id = bound.arguments.get(tenant_id_arg)
            if not tenant_id:
                # No tenant_id, skip rate limiting
                return func(*args, **kwargs)
            
            # Check rate limit
            action = f"api:{func.__name__}"
            result = redis_client.rate_limit_check(tenant_id, action, limit, window)
            
            if not result["allowed"]:
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit exceeded. Try again in {result['reset_at'] - int(redis_client.client.time()[0])} seconds.",
                    headers={
                        "X-RateLimit-Limit": str(limit),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(result["reset_at"])
                    }
                )
            
            return func(*args, **kwargs)
        
        return wrapper
    return decorator
