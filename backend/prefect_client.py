# backend/prefect_client.py - Prefect integration for FastAPI
import os
from typing import Optional, Dict
from datetime import timedelta
from prefect import get_client
from prefect.client.schemas.schedules import CronSchedule, IntervalSchedule
from prefect.deployments import Deployment
import httpx

PREFECT_API_URL = os.getenv("PREFECT_API_URL", "http://prefect:4200/api")


class PrefectOrchestrator:
    """
    Manages Prefect deployments for ResidencyFlow pipelines.
    Each user pipeline gets a Prefect deployment with its schedule.
    """
    
    def __init__(self):
        self.api_url = PREFECT_API_URL
    
    async def create_pipeline_deployment(
        self,
        pipeline_id: str,
        pipeline_name: str,
        frequency: str,
        organization_id: str
    ) -> str:
        """
        Create a Prefect deployment for a ResidencyFlow pipeline.
        
        Args:
            pipeline_id: UUID of the pipeline
            pipeline_name: Human-readable name
            frequency: 'realtime', 'hourly', 'daily', 'weekly', 'manual'
            organization_id: For tagging and isolation
        
        Returns:
            deployment_id: Prefect deployment ID
        """
        async with get_client() as client:
            # Create deployment via Prefect API
            deployment_data = {
                "name": f"pipeline-{pipeline_id}",
                "flow_name": "pipeline_sync_flow",
                "parameters": {
                    "pipeline_id": pipeline_id
                },
                "tags": [
                    f"org:{organization_id}",
                    f"pipeline:{pipeline_name}",
                    "residencyflow"
                ],
                "work_pool_name": "default",
                "schedule": self._create_schedule(frequency),
                "paused": frequency == "manual"
            }
            
            # Use Prefect's REST API
            async with httpx.AsyncClient() as http_client:
                response = await http_client.post(
                    f"{self.api_url}/deployments/",
                    json=deployment_data
                )
                response.raise_for_status()
                result = response.json()
                
                return result["id"]
    
    def _create_schedule(self, frequency: str) -> Optional[Dict]:
        """Convert ResidencyFlow frequency to Prefect schedule"""
        if frequency == "manual":
            return None
        
        if frequency == "realtime":
            # Every 5 minutes for "realtime"
            return {
                "interval": timedelta(minutes=5).total_seconds(),
                "anchor_date": None,
                "timezone": "UTC"
            }
        
        if frequency == "hourly":
            return {
                "interval": timedelta(hours=1).total_seconds(),
                "anchor_date": None,
                "timezone": "UTC"
            }
        
        if frequency == "daily":
            # Cron: Every day at 2 AM UTC
            return {
                "cron": "0 2 * * *",
                "timezone": "UTC"
            }
        
        if frequency == "weekly":
            # Cron: Every Sunday at 2 AM UTC
            return {
                "cron": "0 2 * * 0",
                "timezone": "UTC"
            }
        
        return None
    
    async def update_pipeline_schedule(
        self,
        deployment_id: str,
        frequency: str
    ) -> bool:
        """Update the schedule of an existing deployment"""
        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"{self.api_url}/deployments/{deployment_id}",
                json={
                    "schedule": self._create_schedule(frequency),
                    "paused": frequency == "manual"
                }
            )
            return response.status_code == 200
    
    async def trigger_pipeline_run(self, pipeline_id: str) -> str:
        """
        Manually trigger a pipeline run (for 'Run Now' button).
        
        Returns:
            flow_run_id: Prefect flow run ID
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.api_url}/deployments/name/pipeline-{pipeline_id}/create_flow_run",
                json={
                    "parameters": {"pipeline_id": pipeline_id},
                    "tags": ["manual-trigger"]
                }
            )
            response.raise_for_status()
            result = response.json()
            return result["id"]
    
    async def delete_pipeline_deployment(self, deployment_id: str) -> bool:
        """Delete a Prefect deployment when pipeline is deleted"""
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{self.api_url}/deployments/{deployment_id}"
            )
            return response.status_code == 204
    
    async def get_pipeline_runs(
        self,
        pipeline_id: str,
        limit: int = 10
    ) -> list:
        """
        Get recent flow runs for a pipeline.
        Used for run history in UI.
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.api_url}/flow_runs/filter",
                json={
                    "deployments": {
                        "name": {"like_": f"pipeline-{pipeline_id}"}
                    },
                    "limit": limit,
                    "sort": "START_TIME_DESC"
                }
            )
            
            if response.status_code != 200:
                return []
            
            runs = response.json()
            
            # Format for ResidencyFlow UI
            return [
                {
                    "id": run["id"],
                    "status": run["state"]["type"],
                    "start_time": run["start_time"],
                    "end_time": run.get("end_time"),
                    "duration": self._calculate_duration(
                        run.get("start_time"),
                        run.get("end_time")
                    ),
                    "state_message": run["state"].get("message", "")
                }
                for run in runs
            ]
    
    def _calculate_duration(self, start: Optional[str], end: Optional[str]) -> str:
        """Calculate duration string from timestamps"""
        if not start or not end:
            return "Running..."
        
        from datetime import datetime
        start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
        duration = end_dt - start_dt
        
        seconds = int(duration.total_seconds())
        if seconds < 60:
            return f"{seconds}s"
        elif seconds < 3600:
            return f"{seconds // 60}m {seconds % 60}s"
        else:
            hours = seconds // 3600
            minutes = (seconds % 3600) // 60
            return f"{hours}h {minutes}m"
    
    async def pause_pipeline(self, deployment_id: str) -> bool:
        """Pause a pipeline (stop scheduled runs)"""
        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"{self.api_url}/deployments/{deployment_id}",
                json={"paused": True}
            )
            return response.status_code == 200
    
    async def resume_pipeline(self, deployment_id: str) -> bool:
        """Resume a paused pipeline"""
        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"{self.api_url}/deployments/{deployment_id}",
                json={"paused": False}
            )
            return response.status_code == 200


# Singleton instance
prefect_orchestrator = PrefectOrchestrator()
