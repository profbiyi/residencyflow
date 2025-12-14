# backend/worker_prod.py - Production worker with Prefect + MinIO
import os
import dlt
import hashlib
import polars as pl
from prefect import flow, task, get_run_logger
from prefect.deployments import Deployment
from prefect.server.schemas.schedules import CronSchedule
from database import SessionLocal
import models
from datetime import datetime
from typing import Optional, List

# Configure DLT to use Polars and MinIO for state
os.environ["DLT__DATA_FRAME_LIBRARY"] = "polars"
os.environ["DLT__STATE_DIR"] = "/app/dlt_data"
os.environ["DLT__PIPELINE_DIR"] = "/app/pipelines"

# MinIO configuration for dlt state storage
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")

# Configure dlt to use MinIO for state
os.environ["DLT__BUCKET_URL"] = f"s3://dlt-state"
os.environ["AWS_ACCESS_KEY_ID"] = MINIO_ACCESS_KEY
os.environ["AWS_SECRET_ACCESS_KEY"] = MINIO_SECRET_KEY
os.environ["AWS_ENDPOINT_URL_S3"] = f"http://{MINIO_ENDPOINT}"


def load_destination_from_connector(conn):
    """
    Dynamically create dlt destination from connector configuration.
    No more hardcoded DuckDB!
    """
    type_id = conn.type_id
    config = conn.configuration
    
    # Snowflake
    if type_id == 'snowflake':
        import dlt.destinations.snowflake as snowflake_dest
        return snowflake_dest.snowflake(
            credentials={
                "account": config["account"],
                "user": config["username"],
                "password": config["password"],
                "warehouse": config["warehouse"],
                "database": config["database"],
                "schema": config.get("schema", "public")
            }
        )
    
    # BigQuery
    elif type_id == 'bigquery':
        import dlt.destinations.bigquery as bq_dest
        return bq_dest.bigquery(
            credentials={
                "project_id": config["project_id"],
                "location": config.get("location", "US")
            }
        )
    
    # Postgres as destination
    elif type_id in ['postgres', 'postgres_dw']:
        import dlt.destinations.postgres as pg_dest
        driver = "postgresql"
        creds = f"{driver}://{config['username']}:{config['password']}@{config['host']}:{config['port']}/{config['database']}"
        return pg_dest.postgres(credentials=creds)
    
    # S3/MinIO
    elif type_id in ['s3', 'minio']:
        import dlt.destinations.filesystem as fs_dest
        return fs_dest.filesystem(
            bucket_url=f"s3://{config['bucket']}",
            credentials={
                "aws_access_key_id": config.get("aws_access_key_id", MINIO_ACCESS_KEY),
                "aws_secret_access_key": config.get("aws_secret_access_key", MINIO_SECRET_KEY),
                "endpoint_url": config.get("endpoint_url", f"http://{MINIO_ENDPOINT}")
            }
        )
    
    # DuckDB (for testing/development only)
    elif type_id == 'duckdb':
        import dlt.destinations.duckdb as duckdb_dest
        return duckdb_dest.duckdb(credentials=config.get("path", ":memory:"))
    
    else:
        raise ValueError(f"Unsupported destination type: {type_id}")


def load_source_dynamically(conn, selected_resources=None):
    """Load dlt source with proper configuration"""
    type_id = conn.type_id
    config = conn.configuration
    
    # SQL Databases
    if type_id in ['postgres', 'mysql']:
        from dlt.sources.sql_database import sql_database
        
        driver = "postgresql" if type_id == 'postgres' else "mysql+pymysql"
        creds = f"{driver}://{config['username']}:{config['password']}@{config['host']}:{config['port']}/{config['database']}"
        
        schema_filter = config.get('schema', '').strip()
        
        # Multi-schema support
        if selected_resources and any('.' in r for r in selected_resources):
            schema_tables = {}
            for resource in selected_resources:
                if '.' in resource:
                    schema, table = resource.split('.', 1)
                    if schema not in schema_tables:
                        schema_tables[schema] = []
                    schema_tables[schema].append(table)
            
            sources = []
            for schema, tables in schema_tables.items():
                src = sql_database(credentials=creds, schema=schema, table_names=tables)
                sources.append(src)
            
            return sources[0] if len(sources) == 1 else sources
        
        # Single schema
        kwargs = {'credentials': creds}
        if schema_filter:
            kwargs['schema'] = schema_filter
        if selected_resources:
            kwargs['table_names'] = selected_resources
        
        return sql_database(**kwargs)
    
    # Add more source types as needed
    else:
        raise ValueError(f"Unsupported source type: {type_id}")


@dlt.transformer(name="pii_hasher")
def pii_hasher(items, columns):
    """Polars-native PII hashing transformer"""
    df = pl.DataFrame(items)
    for col in columns:
        if col in df.columns:
            df = df.with_columns(
                pl.col(col).map_elements(
                    lambda x: "HASHED_" + hashlib.sha256(str(x).encode()).hexdigest()[:8],
                    return_dtype=pl.Utf8
                )
            )
    yield from df.to_dicts()


@task(name="load_pipeline_data", retries=3, retry_delay_seconds=60)
def load_pipeline_data(pipeline_id: str):
    """Task to load pipeline configuration from database"""
    logger = get_run_logger()
    db = SessionLocal()
    
    try:
        pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
        if not pipeline:
            raise ValueError(f"Pipeline {pipeline_id} not found")
        
        src_conn = db.query(models.Connector).filter(models.Connector.id == pipeline.source_id).first()
        dest_conn = db.query(models.Connector).filter(models.Connector.id == pipeline.destination_id).first()
        
        if not src_conn or not dest_conn:
            raise ValueError(f"Source or destination connector not found for pipeline {pipeline_id}")
        
        logger.info(f"Loaded pipeline: {pipeline.name}")
        return pipeline, src_conn, dest_conn
    
    finally:
        db.close()


@task(name="run_dlt_sync", retries=2, retry_delay_seconds=120)
def run_dlt_sync(pipeline, src_conn, dest_conn):
    """Task to execute dlt sync"""
    logger = get_run_logger()
    
    # Extract selected resources
    selected_resources = None
    if pipeline.transformation_config and 'selectedResources' in pipeline.transformation_config:
        selected_resources = pipeline.transformation_config['selectedResources']
        logger.info(f"Syncing selected resources: {selected_resources}")
    
    # Load source
    source = load_source_dynamically(src_conn, selected_resources=selected_resources)
    
    # Apply transformations
    if pipeline.transformation_config and 'pii_columns' in pipeline.transformation_config:
        source = source | pii_hasher(columns=pipeline.transformation_config['pii_columns'])
        logger.info("PII hashing applied")
    
    # Load destination
    destination = load_destination_from_connector(dest_conn)
    logger.info(f"Destination: {dest_conn.type_id}")
    
    # Create dlt pipeline with state stored in MinIO
    dlt_pipeline = dlt.pipeline(
        pipeline_name=pipeline.id,
        destination=destination,
        dataset_name=pipeline.name.lower().replace(" ", "_")
    )
    
    # Run sync
    write_disposition = "merge" if "merge" in pipeline.sync_mode else "append"
    logger.info(f"Running sync with disposition: {write_disposition}")
    
    info = dlt_pipeline.run(source, write_disposition=write_disposition)
    
    logger.info(f"Sync completed: {info}")
    return info


@task(name="update_pipeline_status")
def update_pipeline_status(pipeline_id: str, status: str, info=None):
    """Task to update pipeline status in database"""
    logger = get_run_logger()
    db = SessionLocal()
    
    try:
        pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
        if pipeline:
            pipeline.status = status
            pipeline.last_run = datetime.utcnow()
            
            if info and hasattr(info, 'load_info'):
                # Extract row counts from dlt info
                row_counts = sum(
                    load_package.row_counts.get(table_name, 0)
                    for load_package in info.load_packages
                    for table_name in load_package.schema_update.keys()
                )
                pipeline.rows_processed = (pipeline.rows_processed or 0) + row_counts
            
            db.commit()
            logger.info(f"Pipeline {pipeline_id} status updated to {status}")
    
    except Exception as e:
        logger.error(f"Failed to update pipeline status: {e}")
    
    finally:
        db.close()


@flow(name="pipeline_sync_flow", log_prints=True)
def pipeline_sync_flow(pipeline_id: str):
    """
    Prefect flow for running a single pipeline sync.
    This replaces the old polling-based worker.
    """
    logger = get_run_logger()
    logger.info(f"Starting sync for pipeline: {pipeline_id}")
    
    try:
        # Load pipeline configuration
        pipeline, src_conn, dest_conn = load_pipeline_data(pipeline_id)
        
        # Update status to running
        update_pipeline_status(pipeline_id, "RUNNING")
        
        # Execute sync
        info = run_dlt_sync(pipeline, src_conn, dest_conn)
        
        # Update status to idle/completed
        update_pipeline_status(pipeline_id, "IDLE", info)
        
        logger.info(f"✅ Pipeline {pipeline_id} completed successfully")
    
    except Exception as e:
        logger.error(f"❌ Pipeline {pipeline_id} failed: {e}")
        update_pipeline_status(pipeline_id, "FAILED")
        raise


if __name__ == "__main__":
    """
    Deployment script for Prefect.
    This will be run once to register flows with Prefect Server.
    """
    from prefect.client.schemas.schedules import IntervalSchedule
    from datetime import timedelta
    
    print("Registering pipeline_sync_flow with Prefect...")
    
    # The actual deployments will be created dynamically by the API
    # when users create pipelines with schedules
    
    print("✅ Worker ready - waiting for Prefect to schedule flows")
