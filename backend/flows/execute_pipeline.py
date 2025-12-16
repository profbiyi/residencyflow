from __future__ import annotations

import os
import json
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import requests
from prefect import flow, task, get_run_logger

API_URL = os.getenv("CONTROL_PLANE_API_URL", "http://api:8000").rstrip("/")
WORKER_SHARED_KEY = os.getenv("WORKER_SHARED_KEY", "")  # simple internal auth between worker->api

def _headers() -> Dict[str, str]:
    h = {"Content-Type": "application/json"}
    if WORKER_SHARED_KEY:
        h["X-Worker-Key"] = WORKER_SHARED_KEY
    return h

@task(retries=0)
def mark_run_status(run_id: str, status: str, detail: Optional[Dict[str, Any]] = None) -> None:
    payload = {"status": status, "detail": detail or {}}
    requests.post(f"{API_URL}/internal/runs/{run_id}/status", headers=_headers(), data=json.dumps(payload), timeout=30).raise_for_status()

@task(retries=0)
def fetch_run_context(run_id: str) -> Dict[str, Any]:
    r = requests.get(f"{API_URL}/internal/runs/{run_id}/context", headers=_headers(), timeout=30)
    r.raise_for_status()
    return r.json()

@task(retries=0)
def execute_dlt_job(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    ctx should contain everything needed:
      - source connector config (non-secret)
      - decrypted secrets (or a secrets reference the worker can decrypt)
      - destination config
      - pipeline config (tables, full/incremental, cursor, etc.)
      - tenant_id, pipeline_id, run_id
      - s3/minio settings for dlt state/temp
    """
    logger = get_run_logger()
    run_id = ctx["run_id"]

    # Import dlt lazily to keep module import clean
    import dlt

    # Example: configure dlt destinations/sources dynamically
    # You will implement mapping based on ctx["source"]["type"], ctx["destination"]["type"]

    # Critical: ensure dlt writes state/temp to MinIO/S3
    # (you already have this concept; we'll standardize it)
    os.environ["DESTINATION__FILESYSTEM__BUCKET_URL"] = ctx.get("bucket_url", "")
    # If you use dlt's filesystem destination or s3 state, set relevant env vars here

    # TODO: implement your source->resource builder and destination selection
    # For now, we just log context keys as a placeholder
    logger.info({"msg": "Executing dlt job", "run_id": run_id, "keys": list(ctx.keys())})

    # Return metrics (rows loaded, etc.)
    return {"ok": True, "loaded_rows": 0}

@flow(name="execute_pipeline")
def execute_pipeline(run_id: str) -> None:
    logger = get_run_logger()
    logger.info(f"Starting pipeline run: {run_id}")

    mark_run_status(run_id, "running", {"ts": datetime.now(timezone.utc).isoformat()})

    try:
        ctx = fetch_run_context(run_id)
        result = execute_dlt_job(ctx)
        mark_run_status(run_id, "succeeded", {"result": result})
    except Exception as e:
        tb = traceback.format_exc()
        logger.error(tb)
        mark_run_status(run_id, "failed", {"error": str(e), "traceback": tb})
        raise
