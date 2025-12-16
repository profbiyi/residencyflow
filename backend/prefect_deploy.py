from prefect import flow
from flows.execute_pipeline import execute_pipeline

if __name__ == "__main__":
    execute_pipeline.deploy(
        name="execute-pipeline",
        work_pool_name="default-pool",
        description="Execute a single pipeline run by run_id",
    )
