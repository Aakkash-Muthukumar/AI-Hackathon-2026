from fastapi import APIRouter, BackgroundTasks
from models.schemas import DiscoveryRequest, Assignment, AssignmentSource
from services import browserbase_service, supabase_service, redis_service, assignment_service
import uuid

router = APIRouter(prefix="/discovery", tags=["discovery"])


async def _sync_platform(platform: AssignmentSource, credentials: dict):
    raw_list = await browserbase_service.discover_assignments(platform, credentials)
    for raw in raw_list:
        normalized = browserbase_service.normalize_assignment(raw, platform)
        assignment = Assignment(id=str(uuid.uuid4()), **normalized)
        assignment.tasks = await assignment_service.analyze_rubric(assignment)

        data = assignment.model_dump()
        data["created_at"] = data["created_at"].isoformat()
        data["updated_at"] = data["updated_at"].isoformat()
        if data.get("deadline"):
            data["deadline"] = data["deadline"].isoformat()

        await supabase_service.upsert_assignment(data)
        await redis_service.cache_assignment(assignment.id, data)


@router.post("/sync")
async def sync(body: DiscoveryRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(_sync_platform, body.platform, body.credentials)
    return {
        "status": "syncing",
        "platform": body.platform,
        "message": f"Discovery started for {body.platform}. Check /assignments in a few seconds.",
    }


@router.get("/supported")
async def supported_platforms():
    return {
        "platforms": [
            {"id": "canvas", "name": "Canvas LMS", "status": "supported"},
            {"id": "notion", "name": "Notion", "status": "supported"},
            {"id": "google_classroom", "name": "Google Classroom", "status": "supported"},
            {"id": "trello", "name": "Trello", "status": "coming_soon"},
            {"id": "jira", "name": "Jira", "status": "coming_soon"},
            {"id": "asana", "name": "Asana", "status": "coming_soon"},
            {"id": "clickup", "name": "ClickUp", "status": "coming_soon"},
        ]
    }
