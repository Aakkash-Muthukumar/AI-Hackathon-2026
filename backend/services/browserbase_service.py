"""
Browserbase + Stagehand integration for assignment discovery.

Two-phase flow:
  Phase 1 — connect: create a Browserbase context + session, return the live
             view URL so the user can log into the platform in a real browser.
  Phase 2 — scrape: attach Stagehand to the authenticated session and extract
             assignments. No login step — cookies are already in the context.

Context IDs are saved to Redis (30 days) so future syncs reuse the same
authenticated context without requiring the user to log in again.
"""
import os
import sentry_sdk
from typing import List, Optional
from models.schemas import AssignmentSource

_bb: Optional[object] = None
_PROJECT_ID: str = ""
BROWSERBASE_AVAILABLE = False

try:
    from browserbase import Browserbase
    _bb = Browserbase(api_key=os.getenv("BROWSERBASE_API_KEY", ""))
    _PROJECT_ID = os.getenv("BROWSERBASE_PROJECT_ID", "")
    BROWSERBASE_AVAILABLE = True
except ImportError:
    pass


def _require_bb():
    if not BROWSERBASE_AVAILABLE or _bb is None:
        raise RuntimeError(
            "browserbase not installed. Run: pip install browserbase stagehand"
        )


def _get_bb():
    _require_bb()
    assert _bb is not None
    from browserbase import Browserbase as _BB
    bb: _BB = _bb  # type: ignore[assignment]
    return bb


async def _stagehand_for_session(session_id: str):
    from stagehand import Stagehand, StagehandConfig  # type: ignore[import]
    cfg = StagehandConfig(
        env="BROWSERBASE",
        api_key=os.getenv("BROWSERBASE_API_KEY"),
        project_id=_PROJECT_ID,
        session_id=session_id,
        model_name="claude-sonnet-4-6",
        model_api_key=os.getenv("ANTHROPIC_API_KEY"),
    )
    sh = Stagehand(config=cfg)
    await sh.init()
    return sh


# ── Phase 1: Create an authenticated session for the user to log into ─────────

async def create_connect_session(
    platform: AssignmentSource,
    existing_context_id: Optional[str] = None,
) -> dict:
    """
    Create a Browserbase context (if none saved) and a session tied to it.
    Returns session_id, live_view_url, and context_id.
    The caller should save context_id to Redis keyed by (user_id, platform).
    """
    bb = _get_bb()

    if existing_context_id:
        context_id = existing_context_id
    else:
        context = bb.contexts.create(project_id=_PROJECT_ID)
        context_id = context.id

    session = bb.sessions.create(
        project_id=_PROJECT_ID,
        browser_settings={
            "context": {"id": context_id, "persist": True},
        },
    )

    # Navigate to the platform's login page so the user lands there immediately
    _START_URLS = {
        AssignmentSource.CANVAS: "https://canvas.instructure.com/login",
        AssignmentSource.NOTION: "https://www.notion.so/login",
        AssignmentSource.GOOGLE_CLASSROOM: "https://classroom.google.com",
    }
    start_url = _START_URLS.get(platform, "about:blank")

    sh = await _stagehand_for_session(session.id)
    await sh.page.goto(start_url)
    # Do NOT call sh.close() — leave the session open for the user to log in.

    live_view_url = f"https://www.browserbase.com/sessions/{session.id}"

    return {
        "session_id": session.id,
        "live_view_url": live_view_url,
        "context_id": context_id,
    }


# ── Phase 2: Scrape with an already-authenticated session ─────────────────────

async def _scrape_canvas(sh) -> List[dict]:
    await sh.act("Navigate to the Assignments section and list all assignments")
    result = await sh.extract({
        "instruction": "Extract all assignments visible on the page",
        "schema": {
            "assignments": [{
                "title": "string",
                "due_date": "string or null",
                "description": "string",
                "rubric": [{"criterion": "string", "points": "number or null", "description": "string"}],
            }]
        },
    })
    return result.get("assignments", [])


async def _scrape_notion(sh) -> List[dict]:
    await sh.act("Find the assignments or tasks database and open it")
    result = await sh.extract({
        "instruction": "Extract assignment pages with title, due date, content, and any rubric",
        "schema": {
            "assignments": [{
                "title": "string",
                "due_date": "string or null",
                "description": "string",
                "rubric": "array or null",
            }]
        },
    })
    return result.get("assignments", [])


async def _scrape_google_classroom(sh) -> List[dict]:
    await sh.act("Navigate to Classwork across all courses")
    result = await sh.extract({
        "instruction": "Extract every assignment from all courses",
        "schema": {
            "assignments": [{
                "title": "string",
                "course": "string",
                "due_date": "string or null",
                "instructions": "string",
                "rubric": "array or null",
                "document_url": "string or null",
            }]
        },
    })
    return result.get("assignments", [])


_SCRAPERS = {
    AssignmentSource.CANVAS: _scrape_canvas,
    AssignmentSource.NOTION: _scrape_notion,
    AssignmentSource.GOOGLE_CLASSROOM: _scrape_google_classroom,
}


async def scrape_authenticated_session(
    platform: AssignmentSource,
    session_id: str,
) -> List[dict]:
    """
    Connect Stagehand to a session the user has already logged into and
    extract assignments. Does not attempt any login.
    """
    _require_bb()
    bb = _get_bb()

    scraper = _SCRAPERS.get(platform)
    if not scraper:
        raise ValueError(f"Platform '{platform}' not yet supported")

    try:
        sh = await _stagehand_for_session(session_id)
        results = await scraper(sh)
        await sh.close()
        return results
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise
    finally:
        bb.sessions.complete(session_id)


def normalize_assignment(raw: dict, source: AssignmentSource) -> dict:
    rubric_raw = raw.get("rubric") or []
    rubric = []
    for r in rubric_raw:
        if isinstance(r, dict):
            rubric.append({
                "criterion": r.get("criterion") or r.get("name") or "",
                "points": r.get("points"),
                "description": r.get("description") or "",
            })
    return {
        "title": raw.get("title") or "Untitled Assignment",
        "deadline": raw.get("due_date") or raw.get("deadline"),
        "source": source,
        "prompt": raw.get("instructions") or raw.get("description") or raw.get("prompt") or "",
        "rubric": rubric,
        "document_url": raw.get("document_url") or raw.get("submission_link"),
    }
