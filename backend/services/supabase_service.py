import os
from datetime import datetime
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
            # Include legacy rows with no user_id so pre-migration assignments still appear.
            q = q.or_(f"user_id.eq.{user_id},user_id.is.null")
        res = q.execute()
        rows = res.data or []
        # Claim orphaned rows for the requesting user so future requests stay scoped.
        if user_id:
            for row in rows:
                if row.get("user_id") is None:
                    sb.table("assignments").update({"user_id": user_id}).eq(
                        "id", row["id"]
                    ).execute()
                    row["user_id"] = user_id
        return rows
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


async def upsert_doc_evaluation(
    doc_id: str, assignment_id: str, evaluation: dict, doc_marker: str
) -> None:
    try:
        sb = get_supabase()
        sb.table("doc_evaluations").upsert({
            "doc_id": doc_id,
            "assignment_id": assignment_id,
            "evaluation": evaluation,
            "doc_marker": doc_marker,
            "updated_at": datetime.utcnow().isoformat(),
        }).execute()
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise


async def get_doc_evaluation(doc_id: str, assignment_id: str) -> Optional[dict]:
    try:
        sb = get_supabase()
        res = (
            sb.table("doc_evaluations")
            .select("*")
            .eq("doc_id", doc_id)
            .eq("assignment_id", assignment_id)
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as e:
        sentry_sdk.capture_exception(e)
        return None


async def update_assignment_completion(assignment_id: str, overall: float) -> None:
    try:
        sb = get_supabase()
        sb.table("assignments").update({
            "overall_completion": overall,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("id", assignment_id).execute()
    except Exception as e:
        sentry_sdk.capture_exception(e)
