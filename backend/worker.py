# backend/worker.py
import time
import os
import dlt
import json
import importlib
import requests
import hashlib
import polars as pl
from database import SessionLocal
import models
from datetime import datetime

# Configure DLT to use Polars for everything
os.environ["DLT__DATA_FRAME_LIBRARY"] = "polars"

SOURCE_REGISTRY = {
    'postgres': 'dlt.sources.sql_database',
    'hubspot': 'dlt.sources.hubspot',
    'salesforce': 'dlt.sources.salesforce',
    # ... Add all supported
}

def load_source_dynamically(conn, selected_resources=None):
    """
    Load dlt source dynamically based on connector type.
    
    Args:
        conn: Connector model instance
        selected_resources: Optional list of table/resource names to sync (from pipeline config)
    """
    type_id = conn.type_id
    config = conn.configuration
    
    if type_id == 'postgres' or type_id == 'mysql':
         driver = "postgresql" if type_id == 'postgres' else "mysql+pymysql"
         creds = f"{driver}://{config['username']}:{config['password']}@{config['host']}:{config['port']}/{config['database']}"
         module = importlib.import_module("dlt.sources.sql_database")
         
         # Get schema from connector config
         schema_filter = config.get('schema', '').strip()
         
         # Check if we have multi-schema table names (format: schema.table)
         if selected_resources and any('.' in r for r in selected_resources):
             # Multi-schema mode: group tables by schema
             schema_tables = {}
             for resource in selected_resources:
                 if '.' in resource:
                     schema, table = resource.split('.', 1)
                     if schema not in schema_tables:
                         schema_tables[schema] = []
                     schema_tables[schema].append(table)
                 else:
                     # Fallback: use default schema
                     schema = schema_filter or 'public'
                     if schema not in schema_tables:
                         schema_tables[schema] = []
                     schema_tables[schema].append(resource)
             
             # Load each schema's tables separately and combine
             # dlt will handle this via multiple resource definitions
             sources = []
             for schema, tables in schema_tables.items():
                 src = module.sql_database(credentials=creds, schema=schema, table_names=tables)
                 sources.append(src)
             
             # Return first source (dlt can combine multiple sources via pipeline.run)
             # For now, we'll combine them in the pipeline execution
             return sources[0] if len(sources) == 1 else sources
         
         # Single schema mode
         kwargs = {'credentials': creds}
         
         if schema_filter:
             kwargs['schema'] = schema_filter
         
         if selected_resources:
             kwargs['table_names'] = selected_resources
         
         return module.sql_database(**kwargs)
    
    if type_id in SOURCE_REGISTRY:
        module = importlib.import_module(SOURCE_REGISTRY[type_id])
        # Auto-detect main function
        source_func = getattr(module, type_id)
        
        # For API sources, dlt handles resource selection internally
        return source_func(**config)
        
    raise ValueError(f"Unknown source: {type_id}")

@dlt.transformer(name="pii_hasher")
def pii_hasher(items, columns):
    """
    Polars-Native transformation for speed.
    """
    df = pl.DataFrame(items)
    for col in columns:
        if col in df.columns:
            df = df.with_columns(
                pl.col(col).map_elements(lambda x: "HASHED_" + hashlib.sha256(str(x).encode()).hexdigest()[:8], return_dtype=pl.Utf8)
            )
    yield from df.to_dicts()

def process_pipeline(p_id):
    db = SessionLocal()
    pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == p_id).first()
    
    try:
        print(f"WORKER: Starting Pipeline {pipeline.name}")
        src_conn = db.query(models.Connector).filter(models.Connector.id == pipeline.source_id).first()
        dest_conn = db.query(models.Connector).filter(models.Connector.id == pipeline.destination_id).first()
        
        # Extract selected tables/resources from transformation config
        selected_resources = None
        if pipeline.transformation_config and 'selectedResources' in pipeline.transformation_config:
            selected_resources = pipeline.transformation_config['selectedResources']
            print(f"WORKER: Syncing selected resources: {selected_resources}")
        else:
            print(f"WORKER: Syncing all available resources (no selection specified)")
        
        # 1. Source (with optional table selection)
        source = load_source_dynamically(src_conn, selected_resources=selected_resources)
        
        # 2. Transform (Governance)
        if pipeline.transformation_config and 'pii_columns' in pipeline.transformation_config:
            source = source | pii_hasher(columns=pipeline.transformation_config['pii_columns'])
            
        # 3. Dest
        # Simulating S3/Snowflake destination based on config
        destination = dlt.destinations.duckdb("data.duckdb") 
        
        # 4. Run
        p = dlt.pipeline(pipeline_name=pipeline.id, destination=destination, dataset_name="dataset")
        info = p.run(source, write_disposition="merge" if "merge" in pipeline.sync_mode else "append")
        
        print(info)
        pipeline.status = "IDLE"
        pipeline.rows_processed += 100
        pipeline.last_run = datetime.utcnow()
        db.commit()
        
    except Exception as e:
        print(f"ERROR: {e}")
        pipeline.status = "FAILED"
        db.commit()
    finally:
        db.close()

if __name__ == "__main__":
    print("Worker started. Polling for jobs...")
    while True:
        db = SessionLocal()
        # Find queued jobs
        job = db.query(models.Pipeline).filter(models.Pipeline.status == "RUNNING").first()
        db.close()
        
        if job:
            process_pipeline(job.id)
        
        time.sleep(5)
