import os
import time
import requests

from prefect.client.orchestration import get_client
from flows.execute_pipeline import execute_pipeline

PREFECT_API_URL = os.getenv("PREFECT_API_URL", "http://prefect:4200/api").rstrip("/")
POOL_NAME = os.getenv("PREFECT_WORK_POOL", "default-pool")

def wait_for_prefect(timeout_s: int = 90) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            r = requests.get(f"{PREFECT_API_URL}/health", timeout=3)
            if r.status_code == 200:
                return
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError(f"Prefect API not healthy after {timeout_s}s: {PREFECT_API_URL}")

async def ensure_pool() -> None:
    async with get_client() as client:
        try:
            await client.read_work_pool(POOL_NAME)
        except Exception:
            await client.create_work_pool(name=POOL_NAME, type="process")

def main() -> None:
    # Prefect client reads PREFECT_API_URL from env
    wait_for_prefect()

    import asyncio
    asyncio.run(ensure_pool())

    # Deploy flow (Prefect 3 supported)
    execute_pipeline.deploy(
        name="execute-pipeline",
        work_pool_name=POOL_NAME,
        description="Execute a single pipeline run by run_id",
    )

    print("✅ Prefect bootstrap complete (pool + deployment).")

if __name__ == "__main__":
    main()
