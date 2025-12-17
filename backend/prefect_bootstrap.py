import os
import time
import subprocess
import requests

PREFECT_API_URL = os.getenv("PREFECT_API_URL", "http://prefect:4200/api").rstrip("/")
POOL_NAME = os.getenv("PREFECT_WORK_POOL", "default-pool")

def wait_for_prefect(timeout_s: int = 120) -> None:
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

def ensure_pool_http(pool_name: str) -> None:
    r = requests.get(f"{PREFECT_API_URL}/work_pools/{pool_name}", timeout=10)
    if r.status_code == 200:
        return
    if r.status_code != 404:
        r.raise_for_status()

    payload = {"name": pool_name, "type": "process"}
    r2 = requests.post(f"{PREFECT_API_URL}/work_pools/", json=payload, timeout=10)
    r2.raise_for_status()

def deploy_flow() -> None:
    # Prefect 3 CLI: prefect deploy <entrypoint> --name <deployment-name> --pool <work-pool>
    # entrypoint format: "flows/execute_pipeline.py:execute_pipeline"
    cmd = [
        "prefect", "deploy",
        "flows/execute_pipeline.py:execute_pipeline",
        "--name", "execute-pipeline",
        "--pool", POOL_NAME,
    ]
    print(">>> Running:", " ".join(cmd))
    subprocess.check_call(cmd)

def main() -> None:
    wait_for_prefect()
    ensure_pool_http(POOL_NAME)
    deploy_flow()
    print("✅ Prefect bootstrap complete (pool + deployment).")

if __name__ == "__main__":
    main()
