import logging
from fastapi import APIRouter, HTTPException
from models.schemas import (
    DiscoveryRequest,
    ConnectRequest,
    ConnectResponse,
    ScrapeRequest,
    Assignment,
    AssignmentSource,
)
from services import browserbase_service, supabase_service, redis_service, assignment_service
from services.assignment_sync import serialize_assignment

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/discovery", tags=["discovery"])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _persist_assignments(raw_list: list, platform: AssignmentSource, user_id: str) -> int:
    saved = 0
    for raw in raw_list:
        try:
            normalized = browserbase_service.normalize_assignment(raw, platform)
            assignment_id = browserbase_service.stable_assignment_id(
                user_id, platform.value, normalized["title"]
            )
            assignment = Assignment(id=assignment_id, user_id=user_id, **normalized)
            assignment.tasks = await assignment_service.analyze_rubric(assignment)
            assignment = await assignment_service.maybe_attach_google_doc(assignment, user_id)

            data = serialize_assignment(assignment)

            await supabase_service.upsert_assignment(data)
            await redis_service.cache_assignment(assignment.id, data)
            saved += 1
        except Exception as exc:
            logger.error(
                "Failed to persist scraped assignment %r for %s: %s",
                raw.get("title"), platform, exc, exc_info=True,
            )
    return saved


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

    try:
        result = await browserbase_service.create_connect_session(
            platform=body.platform,
            existing_context_id=existing_ctx,
        )
    except Exception as exc:
        logger.error("create_connect_session failed for platform=%s: %s", body.platform, exc, exc_info=True)
        raise HTTPException(502, f"Could not open Browserbase session: {exc}") from exc

    # Persist context so future syncs skip the login step
    await redis_service.save_bb_context(body.user_id, body.platform, result["context_id"])

    return ConnectResponse(
        session_id=result["session_id"],
        live_view_url=result["live_view_url"],
        context_id=result["context_id"],
        platform=body.platform,
        start_url=result.get("start_url"),
        prefer_new_tab=bool(result.get("prefer_new_tab")),
    )


@router.post("/sessions/{session_id}/cancel")
async def cancel_connect_session(session_id: str):
    """Release CDP and terminate the Browserbase session when the user cancels."""
    if not browserbase_service.BROWSERBASE_AVAILABLE:
        raise HTTPException(503, "Browserbase not configured on this server")

    await browserbase_service.terminate_browserbase_session(session_id)
    return {"status": "cancelled", "session_id": session_id}


@router.get("/sessions/{session_id}/live-view")
async def refresh_live_view(session_id: str):
    """Return a fresh embeddable live-view URL for an active Browserbase session."""
    if not browserbase_service.BROWSERBASE_AVAILABLE:
        raise HTTPException(503, "Browserbase not configured on this server")

    try:
        live_view_url = await browserbase_service.refresh_live_view_url(session_id)
    except Exception as exc:
        logger.error("refresh_live_view failed for session=%s: %s", session_id, exc, exc_info=True)
        raise HTTPException(502, f"Could not refresh live view: {exc}") from exc

    return {"session_id": session_id, "live_view_url": live_view_url}


# ── Phase 2: scrape the authenticated session ─────────────────────────────────

@router.post("/scrape")
async def scrape(body: ScrapeRequest):
    """
    Attach Stagehand to the session the user already logged into, extract
    assignments, and persist them. Runs synchronously so errors reach the UI.
    """
    if not browserbase_service.BROWSERBASE_AVAILABLE:
        raise HTTPException(503, "Browserbase not configured on this server")

    try:
        raw_list = await browserbase_service.scrape_authenticated_session(
            body.platform, body.session_id
        )
    except Exception as exc:
        logger.error(
            "Scrape failed for user %s platform %s: %s",
            body.user_id, body.platform, exc, exc_info=True,
        )
        raise HTTPException(502, f"Scan failed: {exc}") from exc

    if not raw_list:
        return {
            "status": "empty",
            "platform": body.platform,
            "assignments_found": 0,
            "assignments_saved": 0,
            "message": (
                "No assignments were found. Make sure you're logged in and have a "
                "Notion database or pages with assignments/tasks, then try again."
            ),
        }

    saved = await _persist_assignments(raw_list, body.platform, body.user_id)
    if saved > 0:
        await redis_service.mark_platform_connected(body.user_id, body.platform.value)

    logger.info(
        "Scraped %d assignment(s), saved %d for user %s platform %s",
        len(raw_list), saved, body.user_id, body.platform,
    )

    return {
        "status": "complete" if saved > 0 else "partial",
        "platform": body.platform,
        "assignments_found": len(raw_list),
        "assignments_saved": saved,
        "message": (
            f"Saved {saved} assignment{'s' if saved != 1 else ''} from {body.platform.value}."
            if saved > 0
            else "Found assignments but could not save them — check server logs."
        ),
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
async def sync(body: DiscoveryRequest):
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
            {"id": "trello", "name": "Trello", "status": "supported"},
            {"id": "jira", "name": "Jira", "status": "supported"},
            {"id": "asana", "name": "Asana", "status": "supported"},
            {"id": "clickup", "name": "ClickUp", "status": "supported"},
        ]
    }
