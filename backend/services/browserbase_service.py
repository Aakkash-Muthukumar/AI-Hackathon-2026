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
import hashlib
import logging
import asyncio
import re
from datetime import datetime
import sentry_sdk
from typing import Any, Dict, List, Optional
from models.schemas import AssignmentSource

logger = logging.getLogger(__name__)

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


MODEL_NAME = "anthropic/claude-sonnet-4-6"
_MODEL_OPTIONS = {"model": MODEL_NAME}

_ASSIGNMENTS_SCHEMA = {
    "type": "object",
    "properties": {
        "assignments": {
            "type": "array",
            "description": "Assignments, tasks, or homework items found",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Assignment title"},
                    "due_date": {
                        "type": "string",
                        "description": "Due date if shown, else empty string",
                    },
                    "description": {
                        "type": "string",
                        "description": "Instructions, body text, or requirements",
                    },
                    "rubric": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "criterion": {"type": "string"},
                                "points": {"type": "number"},
                                "description": {"type": "string"},
                            },
                        },
                    },
                },
                "required": ["title"],
            },
        }
    },
    "required": ["assignments"],
}


def _get_stagehand_client():
    from stagehand import AsyncStagehand  # type: ignore[import]
    return AsyncStagehand(
        browserbase_api_key=os.getenv("BROWSERBASE_API_KEY"),
        model_api_key=os.getenv("ANTHROPIC_API_KEY"),
    )


def _assignments_from_extract(data) -> List[dict]:
    if not data:
        return []
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("assignments", "items", "tasks", "results"):
        items = data.get(key)
        if isinstance(items, list):
            return [r for r in items if isinstance(r, dict)]
    if data.get("title"):
        return [data]
    return []


async def _sh_start_session(client, browserbase_session_id: str) -> str:
    """
    Register an existing Browserbase session with Stagehand and set the AI model.

    Required before act/extract/navigate — otherwise Stagehand returns 400.
    """
    response = await client.sessions.start(
        model_name=MODEL_NAME,
        browserbase_session_id=browserbase_session_id,
    )
    data = getattr(response, "data", None)
    session_id = getattr(data, "session_id", None) or browserbase_session_id
    logger.info("Stagehand session ready: %s", session_id)
    return session_id


async def _sh_navigate(client, session_id: str, url: str) -> None:
    await client.sessions.navigate(id=session_id, url=url)


async def _sh_act(client, session_id: str, instruction: str) -> None:
    await client.sessions.act(
        id=session_id,
        input=instruction,
        options=_MODEL_OPTIONS,
    )


async def _sh_extract(client, session_id: str, instruction: str) -> List[dict]:
    response = await client.sessions.extract(
        id=session_id,
        instruction=instruction,
        schema=_ASSIGNMENTS_SCHEMA,
        options=_MODEL_OPTIONS,
    )
    result = getattr(getattr(response, "data", None), "result", None)
    return _assignments_from_extract(result)


async def _sh_execute(client, session_id: str, instruction: str, max_steps: int = 12) -> None:
    await client.sessions.execute(
        id=session_id,
        execute_options={"instruction": instruction, "max_steps": max_steps},
        agent_config={
            "model": MODEL_NAME,
            "cua": False,
        },
    )


# Platform login pages — user navigates here inside the live browser.
_START_URLS = {
    AssignmentSource.CANVAS: "https://canvas.instructure.com/login",
    AssignmentSource.NOTION: "https://www.notion.so/login",
    AssignmentSource.GOOGLE_CLASSROOM: (
        "https://accounts.google.com/signin"
        "?continue=https://classroom.google.com&flowName=GlifWebSignIn"
    ),
    AssignmentSource.TRELLO: "https://trello.com/login",
    AssignmentSource.JIRA: "https://id.atlassian.com/login",
    AssignmentSource.ASANA: "https://app.asana.com/-/login",
    AssignmentSource.CLICKUP: "https://app.clickup.com/login",
}

# Platforms where OAuth popups block iframe login — open live view in a new tab.
OAUTH_HEAVY_PLATFORMS = frozenset({
    AssignmentSource.NOTION,
    AssignmentSource.GOOGLE_CLASSROOM,
    AssignmentSource.TRELLO,
    AssignmentSource.JIRA,
    AssignmentSource.ASANA,
    AssignmentSource.CLICKUP,
})


# Active Phase-1 CDP connections — kept open so navigation works without
# killing the live-view WebSocket. Released on scrape, cancel, or timeout.
_active_connect_sessions: Dict[str, Dict[str, Any]] = {}


async def _navigate_connect_session(session, start_url: Optional[str]) -> None:
    """
    Connect Playwright to the session and navigate to the platform login page.

    The CDP connection stays open until release_connect_session() is called.
    Disconnecting immediately after goto() breaks the embedded live view.
    """
    from playwright.async_api import async_playwright  # type: ignore[import]

    connect_url = getattr(session, "connect_url", None)
    if not connect_url:
        api_key = os.getenv("BROWSERBASE_API_KEY", "")
        connect_url = (
            f"wss://connect.browserbase.com"
            f"?apiKey={api_key}&sessionId={session.id}"
        )

    pw = await async_playwright().start()
    browser = await pw.chromium.connect_over_cdp(connect_url)
    ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
    page = ctx.pages[0] if ctx.pages else await ctx.new_page()

    if start_url:
        await page.goto(start_url, wait_until="domcontentloaded", timeout=45_000)

    _active_connect_sessions[session.id] = {"pw": pw, "browser": browser}


async def release_connect_session(session_id: str) -> None:
    """Close the Phase-1 Playwright CDP connection for a connect session."""
    entry = _active_connect_sessions.pop(session_id, None)
    if not entry:
        return
    browser = entry.get("browser")
    pw = entry.get("pw")
    try:
        if browser:
            # Playwright CDP: close() drops the local connection without killing BB session.
            close_fn = getattr(browser, "close", None)
            disconnect_fn = getattr(browser, "disconnect", None)
            if disconnect_fn:
                await disconnect_fn()
            elif close_fn:
                await close_fn()
    except Exception as err:
        logger.warning("connect browser release failed for %s: %s", session_id, err)
    try:
        if pw:
            await pw.stop()
    except Exception as err:
        logger.warning("playwright stop failed for %s: %s", session_id, err)


async def terminate_browserbase_session(session_id: str) -> None:
    """
    End a keep-alive Browserbase session and flush persisted context data.

    Per Browserbase docs, call REQUEST_RELEASE when done so cookies saved with
    persist: true are written back to the Context.
    """
    await release_connect_session(session_id)
    try:
        bb = _get_bb()
        bb.sessions.update(
            session_id,
            status="REQUEST_RELEASE",
            project_id=_PROJECT_ID,
        )
        # Context sync happens after session close — brief wait before reuse.
        await asyncio.sleep(2)
    except Exception as err:
        logger.warning("Could not terminate Browserbase session %s: %s", session_id, err)


async def create_connect_session(
    platform: AssignmentSource,
    existing_context_id: Optional[str] = None,
) -> dict:
    """
    Create a Browserbase context (if none saved) and a session tied to it.
    Returns session_id, live_view_url, context_id, and start_url.
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
        keep_alive=True,
        timeout=1800,
        browser_settings={
            "context": {"id": context_id, "persist": True},
        },
    )

    start_url = _START_URLS.get(platform)
    try:
        await _navigate_connect_session(session, start_url)
    except Exception as nav_err:
        await release_connect_session(session.id)
        logger.warning("Phase 1 navigation failed (user can navigate manually): %s", nav_err)

    await asyncio.sleep(0.5)
    live_view_url = await _get_live_view_url(bb, session.id)

    return {
        "session_id": session.id,
        "live_view_url": live_view_url,
        "context_id": context_id,
        "start_url": start_url,
        "prefer_new_tab": platform in OAUTH_HEAVY_PLATFORMS,
    }


async def refresh_live_view_url(session_id: str) -> str:
    """Fetch a fresh embeddable live-view URL for an existing session."""
    bb = _get_bb()
    return await _get_live_view_url(bb, session_id)


async def _get_live_view_url(bb, session_id: str) -> str:
    """
    Return the embeddable HTTPS live-view URL for a running session.

    Uses Browserbase's debug API (`sessions.debug`) which returns
    `debuggerFullscreenUrl` — the URL meant for iframe embedding.

    Do NOT fall back to https://www.browserbase.com/sessions/{id}; that is the
    Browserbase dashboard login page, not the remote browser view.
    """
    last_err: Optional[Exception] = None
    for attempt in range(3):
        try:
            live = bb.sessions.debug(session_id)
            pages = getattr(live, "pages", None) or []
            if pages:
                url = getattr(pages[0], "debugger_fullscreen_url", None)
                if url and str(url).startswith("https://"):
                    return str(url)
            url = getattr(live, "debugger_fullscreen_url", None)
            if url and str(url).startswith("https://"):
                return str(url)
            raise RuntimeError("Browserbase debug API returned no embeddable live view URL")
        except Exception as err:
            last_err = err
            if attempt < 2:
                await asyncio.sleep(0.5)
    raise RuntimeError(
        f"Could not fetch Browserbase live view URL for session {session_id}: {last_err}"
    ) from last_err


# ── Phase 2: Scrape with an already-authenticated session ─────────────────────

async def _scrape_canvas(client, session_id: str) -> List[dict]:
    await _sh_act(client, session_id, "Open the Assignments area and show all assignments")
    return await _sh_extract(
        client,
        session_id,
        "Extract every assignment with title, due date, description, and rubric criteria",
    )


async def _scrape_notion(client, session_id: str) -> List[dict]:
    await _sh_navigate(client, session_id, "https://www.notion.so/")
    await asyncio.sleep(2)
    await _sh_execute(
        client,
        session_id,
        "In this Notion workspace, find pages or databases about assignments, homework, "
        "tasks, deadlines, or coursework. Open the most relevant database or list view.",
        max_steps=15,
    )
    return await _sh_extract(
        client,
        session_id,
        "Extract every assignment-like item visible: title, due date, page content as "
        "description, and any rubric or grading criteria",
    )


async def _scrape_google_classroom(client, session_id: str) -> List[dict]:
    await _sh_navigate(client, session_id, "https://classroom.google.com/")
    await asyncio.sleep(2)
    await _sh_act(
        client,
        session_id,
        "Open Classwork for each course and show all assignments",
    )
    return await _sh_extract(
        client,
        session_id,
        "Extract every assignment from all visible courses with title, course name, due "
        "date, instructions, rubric, and any linked document URL",
    )


_EXTRACT_INSTRUCTION = (
    "Extract every assignment-like item visible: title, due date, description or "
    "instructions, and any rubric or grading criteria"
)


async def _scrape_board_app(
    client,
    session_id: str,
    home_url: str,
    agent_instruction: str,
) -> List[dict]:
    await _sh_navigate(client, session_id, home_url)
    await asyncio.sleep(2)
    await _sh_execute(client, session_id, agent_instruction, max_steps=15)
    return await _sh_extract(client, session_id, _EXTRACT_INSTRUCTION)


async def _scrape_trello(client, session_id: str) -> List[dict]:
    return await _scrape_board_app(
        client,
        session_id,
        "https://trello.com/",
        "Find boards with cards that represent assignments, homework, tasks, or deadlines. "
        "Open the most relevant boards and lists.",
    )


async def _scrape_jira(client, session_id: str) -> List[dict]:
    return await _scrape_board_app(
        client,
        session_id,
        "https://home.atlassian.com/",
        "Open Jira and find projects or boards with issues that look like assignments, "
        "homework, or tasks with due dates. Show list or board views.",
    )


async def _scrape_asana(client, session_id: str) -> List[dict]:
    return await _scrape_board_app(
        client,
        session_id,
        "https://app.asana.com/",
        "Find projects or lists with tasks that represent assignments, homework, or "
        "coursework. Open the most relevant project views.",
    )


async def _scrape_clickup(client, session_id: str) -> List[dict]:
    return await _scrape_board_app(
        client,
        session_id,
        "https://app.clickup.com/",
        "Find spaces, lists, or boards with tasks that represent assignments, homework, "
        "or deadlines. Open the most relevant views.",
    )


_SCRAPERS = {
    AssignmentSource.CANVAS: _scrape_canvas,
    AssignmentSource.NOTION: _scrape_notion,
    AssignmentSource.GOOGLE_CLASSROOM: _scrape_google_classroom,
    AssignmentSource.TRELLO: _scrape_trello,
    AssignmentSource.JIRA: _scrape_jira,
    AssignmentSource.ASANA: _scrape_asana,
    AssignmentSource.CLICKUP: _scrape_clickup,
}


async def scrape_authenticated_session(
    platform: AssignmentSource,
    session_id: str,
) -> List[dict]:
    """
    Use Stagehand v3 against the Browserbase session the user logged into.
    """
    _require_bb()

    await release_connect_session(session_id)
    await asyncio.sleep(0.5)

    scraper = _SCRAPERS.get(platform)
    if not scraper:
        raise ValueError(f"Platform '{platform}' not yet supported")

    client = _get_stagehand_client()
    try:
        async with client:
            stagehand_id = await _sh_start_session(client, session_id)
            results = await scraper(client, stagehand_id)
            logger.info(
                "Stagehand extracted %d raw assignment(s) from %s session %s",
                len(results), platform.value, session_id,
            )
            return results
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise
    finally:
        await terminate_browserbase_session(session_id)


def stable_assignment_id(user_id: str, platform: str, title: str) -> str:
    """
    Deterministic UUID-shaped ID so re-syncing the same platform upserts
    existing assignments instead of creating duplicates.
    """
    key = f"{user_id}:{platform}:{title.lower().strip()}"
    h = hashlib.sha256(key.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def _parse_deadline(value) -> Optional[datetime]:
    """Parse scraped due-date strings into datetimes; return None if unknown."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text or text.lower() in {"none", "null", "n/a", "unknown", "tbd"}:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        pass
    for fmt in (
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%B %d, %Y",
        "%b %d, %Y",
        "%B %d %Y",
        "%b %d %Y",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    # Strip ordinal suffixes: "June 21st, 2023" -> "June 21, 2023"
    cleaned = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", text)
    if cleaned != text:
        return _parse_deadline(cleaned)
    return None


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
    raw_deadline = raw.get("due_date") or raw.get("deadline")
    return {
        "title": raw.get("title") or "Untitled Assignment",
        "deadline": _parse_deadline(raw_deadline),
        "source": source,
        "prompt": raw.get("instructions") or raw.get("description") or raw.get("prompt") or "",
        "rubric": rubric,
        "document_url": raw.get("document_url") or raw.get("submission_link"),
    }
