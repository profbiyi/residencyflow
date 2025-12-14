# How ResidencyFlow Leverages dlt's Native Capabilities

## Overview
ResidencyFlow is a **thin orchestration layer** on top of dlt. We let dlt handle 99% of the ETL logic natively.

---

## 1. Extraction Logic (100% dlt)

### What dlt Does Automatically:
```python
from dlt.sources.sql_database import sql_database

# dlt handles:
# ✅ Connection pooling
# ✅ Query generation (SELECT statements)
# ✅ Batching (configurable chunk size)
# ✅ Type detection and coercion
# ✅ NULL handling
# ✅ Parallel table extraction
# ✅ Memory management
# ✅ Error recovery

source = sql_database(credentials=conn_string, table_names=['users', 'orders'])
```

### What We Do:
- Map user's connector credentials → dlt source
- **That's it!**

---

## 2. Incremental Mechanics (100% dlt)

### What dlt Does Automatically:

#### State Management
```python
# dlt stores state in MinIO (S3)
# State includes:
# - Last sync timestamp
# - Cursor values (e.g., last_modified_at > '2024-12-14')
# - Merge keys (primary keys for dedup)
# - Schema versions
```

#### Incremental Strategies (Native dlt)
```python
# dlt detects incremental columns automatically!

# 1. Append mode
pipeline.run(source, write_disposition="append")
# dlt appends new rows, tracks cursor

# 2. Merge mode  
pipeline.run(source, write_disposition="merge")
# dlt does UPSERT based on primary key
# Handles: INSERT + UPDATE in one operation

# 3. Replace mode
pipeline.run(source, write_disposition="replace")
# dlt truncates and reloads (full refresh)
```

#### Cursor Tracking (Automatic!)
```python
# dlt automatically finds incremental columns:
# - updated_at
# - modified_date  
# - _timestamp
# - Or any timestamp/sequence column

# dlt generates SQL like:
# SELECT * FROM users WHERE updated_at > :last_value
```

### What We Do:
- Pass user's selected sync mode to dlt
- **dlt handles everything else!**

---

## 3. Schema Evolution (100% dlt)

### What dlt Does Automatically:

#### Schema Detection
```python
# On first run, dlt:
# ✅ Detects all column types
# ✅ Infers nullability
# ✅ Detects primary keys
# ✅ Handles nested JSON (flattens or nests based on config)
# ✅ Stores schema in MinIO
```

#### Schema Migration (Automatic!)
```python
# When source schema changes:

# NEW COLUMN ADDED:
# dlt generates: ALTER TABLE users ADD COLUMN phone_number VARCHAR;

# COLUMN TYPE CHANGED:
# dlt generates: ALTER TABLE users ALTER COLUMN age TYPE BIGINT;

# COLUMN REMOVED:
# dlt keeps old column (preserves history)

# NESTED JSON STRUCTURE CHANGED:
# dlt adjusts child tables automatically
```

#### Schema Policies (Native dlt)
```toml
# In config.toml:
[normalize]
schema_update_mode = "evolve"   # Add new columns (our default)
# OR
schema_update_mode = "freeze"   # Block schema changes
# OR  
schema_update_mode = "discard_value"  # Ignore new columns
```

### What We Do:
- User sets schema policy in UI
- We pass it to dlt config
- **dlt enforces the policy!**

---

## 4. Destination Loaders (100% dlt)

### Snowflake (dlt native)
```python
import dlt.destinations.snowflake as snowflake_dest

destination = snowflake_dest.snowflake(credentials={...})

# dlt handles:
# ✅ Staging files to Snowflake internal stage
# ✅ Generates COPY INTO commands
# ✅ Executes in transactions
# ✅ Creates tables with correct types
# ✅ Manages warehouse usage
```

### BigQuery (dlt native)
```python
import dlt.destinations.bigquery as bq_dest

destination = bq_dest.bigquery(credentials={...})

# dlt handles:
# ✅ Streaming inserts for small batches
# ✅ Load jobs for large batches
# ✅ Schema updates via ALTER TABLE
# ✅ Partitioning (if configured)
# ✅ Automatic retries on quota errors
```

### Postgres (dlt native)
```python
import dlt.destinations.postgres as pg_dest

destination = pg_dest.postgres(credentials=conn_string)

# dlt handles:
# ✅ CREATE TABLE IF NOT EXISTS
# ✅ INSERT with conflict handling
# ✅ Staging tables for merge operations
# ✅ Index creation
# ✅ Transaction management
```

### S3/MinIO (dlt native)
```python
import dlt.destinations.filesystem as fs_dest

destination = fs_dest.filesystem(bucket_url="s3://bucket")

# dlt handles:
# ✅ Writes Parquet files with compression
# ✅ Partitioning by date/value
# ✅ Schema files alongside data
# ✅ Atomic writes (tmp → final)
```

### What We Do:
- Map user's destination connector → dlt destination
- **dlt does all loading logic!**

---

## 5. Performance Optimizations (dlt Native)

### Polars Integration
```python
os.environ["DLT__DATA_FRAME_LIBRARY"] = "polars"

# dlt uses Polars for:
# ✅ Zero-copy transformations
# ✅ Multi-threaded operations
# ✅ Arrow IPC for data transfer
# ✅ Memory-efficient batching
```

### Parallel Processing
```toml
[extract]
workers = 4  # Parallel table extraction

[load]
workers = 4  # Parallel loading to destination
```

### Compression
```python
# dlt automatically compresses:
# - State files in MinIO
# - Staging files (Parquet, gzip)
# - Network transfer
```

---

## 6. Error Handling & Retries (dlt Native)

### Automatic Retries
```toml
[load]
retry_attempts = 3
retry_backoff_factor = 2

# dlt retries on:
# - Network errors
# - Destination timeouts
# - Transient database errors
```

### Transaction Safety
```python
# dlt wraps loads in transactions:
# - All-or-nothing loading
# - Rollback on failure
# - Idempotent operations (re-run safe)
```

---

## 7. Observability (dlt Native)

### Metrics dlt Exposes
```python
info = pipeline.run(source)

# info contains:
# - Row counts per table
# - Bytes processed
# - Duration
# - Schema changes detected
# - Warnings/errors
```

### Logging
```python
# dlt logs to:
# - Console (structured JSON)
# - Files (rotating logs)
# - State tracking (MinIO)
```

---

## What ResidencyFlow Actually Does

### Our Thin Layer:
1. **Connector Management**: Store user credentials
2. **Pipeline Orchestration**: Trigger dlt via Prefect
3. **UI**: Table selection, scheduling, monitoring
4. **Multi-tenancy**: Isolate pipelines by organization
5. **Observability**: Aggregate dlt metrics in Grafana

### What We DON'T Do:
- ❌ Write extraction queries
- ❌ Manage incremental state
- ❌ Handle schema evolution
- ❌ Write destination loaders
- ❌ Implement retry logic
- ❌ Manage transactions
- ❌ Handle type conversions

**dlt does ALL of this natively!**

---

## Proof: Our Code is Minimal

### worker_prod.py (175 lines total)
- **Lines 31-88**: Map configs to dlt destinations (just credentials)
- **Lines 91-133**: Map configs to dlt sources (just credentials)
- **Lines 136-148**: Optional PII hashing (dlt transformer)
- **Lines 175-212**: Call `dlt.pipeline().run()` (1 line does everything!)

### The Magic Line:
```python
info = dlt_pipeline.run(source, write_disposition=write_disposition)
```

This single line triggers:
1. ✅ Extraction with incremental tracking
2. ✅ Schema detection and evolution
3. ✅ Normalization and type coercion
4. ✅ Destination loading with retries
5. ✅ State persistence to MinIO
6. ✅ Transaction management
7. ✅ Error handling

**We're just orchestrating dlt's native power!** 🚀

---

## References

- [dlt Documentation](https://dlthub.com/docs/)
- [dlt Sources](https://dlthub.com/docs/dlt-ecosystem/verified-sources)
- [dlt Destinations](https://dlthub.com/docs/dlt-ecosystem/destinations)
- [dlt Incremental Loading](https://dlthub.com/docs/general-usage/incremental-loading)
- [dlt Schema Evolution](https://dlthub.com/docs/general-usage/schema-evolution)
