from fastapi import APIRouter, BackgroundTasks, HTTPException
from models.schemas import (
    DiscoveryRequest,
    ConnectRequest,
    ConnectResponse,
    ScrapeRequest,
    Assignment,
    AssignmentSource,
)
from services import browserbase_service, supabase_service, redis_service, assignment_service
import uuid

router = APIRouter(prefix="/discovery", tags=["discovery"])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _persist_assignments(raw_list: list, platform: AssignmentSource):
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


# ── Phase 1: create a live-view session the user logs into ───────────────────

@router.post("/connect", response_model=ConnectResponse)
async def connect(body: ConnectRequest):
    """
    Create a Browserbase session (with a persistent context) and return a
    live_view_url the frontend embeds in an iframe. The user logs into the
    platform themselves, so Scaffold never sees their credentials.
    """
    if not browserbase_service.BROWSERBASE_AVAILABLE:
        raise HTTPException(503, "Browserbase not configured on this server")

    existing_ctx = await redis_service.get_bb_context(body.user_id, body.platform)

    result = await browserbase_service.create_connect_session(
        platform=body.platform,
        existing_context_id=existing_ctx,
    )

    # Persist context so future syncs skip the login step
    await redis_service.save_bb_context(body.user_id, body.platform, result["context_id"])

    return ConnectResponse(
        session_id=result["session_id"],
        live_view_url=result["live_view_url"],
        context_id=result["context_id"],
        platform=body.platform,
    )


# ── Phase 2: scrape the authenticated session ─────────────────────────────────

@router.post("/scrape")
async def scrape(body: ScrapeRequest, background_tasks: BackgroundTasks):
    """
    Attach Stagehand to the session the user already logged into and extract
    assignments as a background task.
    """
    if not browserbase_service.BROWSERBASE_AVAILABLE:
        raise HTTPException(503, "Browserbase not configured on this server")

    async def _run():
        raw_list = await browserbase_service.scrape_authenticated_session(
            body.platform, body.session_id
        )
        await _persist_assignments(raw_list, body.platform)

    background_tasks.add_task(_run)
    return {
        "status": "scraping",
        "platform": body.platform,
        "message": f"Extracting assignments from {body.platform}. Check /assignments in a few seconds.",
    }


# ── Connection status ─────────────────────────────────────────────────────────

@router.get("/status/{user_id}")
async def connection_status(user_id: str):
    """Return which platforms the user has a saved Browserbase context for."""
    connected = await redis_service.get_connected_platforms(user_id)
    return {"user_id": user_id, "connected_platforms": connected}


@router.delete("/disconnect/{user_id}/{platform}")
async def disconnect(user_id: str, platform: str):
    """Remove a saved Browserbase context, forcing re-login on next connect."""
    await redis_service.delete_bb_context(user_id, platform)
    return {"status": "disconnected", "platform": platform}


# ── Legacy: manual credentials sync (kept for backward compat) ───────────────

@router.post("/sync")
async def sync(body: DiscoveryRequest, background_tasks: BackgroundTasks):
    raise HTTPException(
        410,
        "Direct credential sync has been removed. Use POST /discovery/connect to "
        "start a live-view session, then POST /discovery/scrape when logged in.",
    )


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
