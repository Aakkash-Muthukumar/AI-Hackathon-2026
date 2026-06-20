import os
from typing import Any, Optional, List
import sentry_sdk

SUPABASE_AVAILABLE = False
try:
    from supabase import create_client  # type: ignore[import]
    SUPABASE_AVAILABLE = True
except ImportError:
    pass

_client: Any = None


def get_supabase() -> Any:
    if not SUPABASE_AVAILABLE:
        raise RuntimeError("supabase not installed. Run: pip install supabase")
    global _client
    if _client is None:
        _client = create_client(  # type: ignore[possibly-undefined]
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_SERVICE_KEY", ""),
        )
    return _client


async def upsert_assignment(data: dict) -> dict:
    try:
        sb = get_supabase()
        res = sb.table("assignments").upsert(data).execute()
        return res.data[0] if res.data else data
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise


async def get_assignment(assignment_id: str) -> Optional[dict]:
    try:
        sb = get_supabase()
        res = sb.table("assignments").select("*").eq("id", assignment_id).single().execute()
        return res.data
    except Exception as e:
        sentry_sdk.capture_exception(e)
        return None


async def list_assignments(user_id: Optional[str] = None) -> List[dict]:
    try:
        sb = get_supabase()
        q = sb.table("assignments").select("*").order("deadline", desc=False)
        if user_id:
            q = q.eq("user_id", user_id)
        res = q.execute()
        return res.data or []
    except Exception as e:
        sentry_sdk.capture_exception(e)
        return []


async def delete_assignment(assignment_id: str) -> None:
    try:
        sb = get_supabase()
        sb.table("assignments").delete().eq("id", assignment_id).execute()
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise
