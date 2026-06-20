"""
Browserbase + Stagehand integration for assignment discovery.
Each platform handler:
  1. Creates a Browserbase session
  2. Uses Stagehand's AI-powered act/extract to navigate and scrape
  3. Returns raw assignment data that is then normalized
"""
import os
import sentry_sdk
from typing import List, Optional
from models.schemas import AssignmentSource

# Optional import — guarded by BROWSERBASE_AVAILABLE throughout
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


async def _stagehand_for_session(session_id: str):
    # Stagehand is imported lazily so the module loads even without the package.
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


async def discover_canvas(credentials: dict) -> List[dict]:
    _require_bb()
    assert _bb is not None
    from browserbase import Browserbase as _BB
    bb: _BB = _bb  # type: ignore[assignment]

    session = bb.sessions.create(project_id=_PROJECT_ID)
    try:
        sh = await _stagehand_for_session(session.id)
        await sh.page.goto(credentials.get("canvas_url", "https://canvas.instructure.com"))
        await sh.act(f"Log in with username '{credentials['username']}' and password '{credentials['password']}'")
        await sh.act("Navigate to the Assignments section")
        result = await sh.extract({
            "instruction": "Extract all assignments",
            "schema": {
                "assignments": [{
                    "title": "string",
                    "due_date": "string or null",
                    "description": "string",
                    "rubric": [{"criterion": "string", "points": "number or null", "description": "string"}],
                }]
            },
        })
        await sh.close()
        return result.get("assignments", [])
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise
    finally:
        bb.sessions.complete(session.id)


async def discover_notion(credentials: dict) -> List[dict]:
    _require_bb()
    assert _bb is not None
    from browserbase import Browserbase as _BB
    bb: _BB = _bb  # type: ignore[assignment]

    session = bb.sessions.create(project_id=_PROJECT_ID)
    try:
        sh = await _stagehand_for_session(session.id)
        await sh.page.goto("https://notion.so")
        await sh.act(f"Sign in with email '{credentials['email']}' and password '{credentials['password']}'")
        await sh.act("Find the assignments or tasks database")
        result = await sh.extract({
            "instruction": "Extract assignment pages with title, due date, content, and rubric",
            "schema": {
                "assignments": [{
                    "title": "string",
                    "due_date": "string or null",
                    "description": "string",
                    "rubric": "array or null",
                }]
            },
        })
        await sh.close()
        return result.get("assignments", [])
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise
    finally:
        bb.sessions.complete(session.id)


async def discover_google_classroom(credentials: dict) -> List[dict]:
    _require_bb()
    assert _bb is not None
    from browserbase import Browserbase as _BB
    bb: _BB = _bb  # type: ignore[assignment]

    session = bb.sessions.create(project_id=_PROJECT_ID)
    try:
        sh = await _stagehand_for_session(session.id)
        await sh.page.goto("https://classroom.google.com")
        await sh.act(f"Sign in with Google account '{credentials['email']}'")
        await sh.act("Navigate to Classwork across all courses and collect all assignments")
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
        await sh.close()
        return result.get("assignments", [])
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise
    finally:
        bb.sessions.complete(session.id)


_HANDLERS = {
    AssignmentSource.CANVAS: discover_canvas,
    AssignmentSource.NOTION: discover_notion,
    AssignmentSource.GOOGLE_CLASSROOM: discover_google_classroom,
}


async def discover_assignments(platform: AssignmentSource, credentials: dict) -> List[dict]:
    handler = _HANDLERS.get(platform)
    if not handler:
        raise ValueError(f"Platform '{platform}' not yet supported for automatic discovery")
    return await handler(credentials)


def normalize_assignment(raw: dict, source: AssignmentSource) -> dict:
    """Normalize scraped data to the Assignment schema shape."""
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
