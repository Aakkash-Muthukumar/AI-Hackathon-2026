from fastapi import APIRouter, HTTPException
from models.schemas import EvaluateRequest, EvaluateResponse, Assignment
from services import redis_service, google_service, claude_service, supabase_service

router = APIRouter(prefix="/evaluate", tags=["evaluate"])


async def _load_assignment(assignment_id: str) -> Assignment:
    cached = await redis_service.get_cached_assignment(assignment_id)
    if cached:
        return Assignment(**cached)
    row = await supabase_service.get_assignment(assignment_id)
    if not row:
        raise HTTPException(404, "Assignment not found — create it in the dashboard first")
    await redis_service.cache_assignment(assignment_id, row)
    return Assignment(**row)


@router.post("/", response_model=EvaluateResponse)
async def evaluate(body: EvaluateRequest):
    """
    Fetch the document from Google Drive and score each assignment requirement.

    Flow:
      1. Load the user's Google token from Redis.
      2. Return cached result if available (5-min TTL, avoids duplicate Claude calls).
      3. Load the assignment (Redis → Supabase).
      4. Fetch document plain text via Drive export API.
      5. Call Claude with prompt-cached rubric prefix.
      6. Cache and return scores.
    """
    # 1. Token check
    token_data = await redis_service.get_google_token(body.user_id)
    if not token_data:
        raise HTTPException(
            401,
            "Google account not connected. "
            f"Visit /auth/google/authorize?user_id={body.user_id} to authorize.",
        )

    # 2. Check Drive modifiedTime — skip cache if the doc changed since last eval
    try:
        meta, token_data = await google_service.get_file_metadata(body.doc_id, token_data)
        await redis_service.save_google_token(body.user_id, token_data)
    except Exception as e:
        raise HTTPException(502, f"Could not read document metadata from Google: {e}")

    modified_time = meta.get("modifiedTime", "")

    cached = await redis_service.get_cached_eval_result(body.doc_id, body.assignment_id)
    if cached and cached.get("modified_time") == modified_time and cached.get("result"):
        return EvaluateResponse(**cached["result"])

    # 3. Assignment
    assignment = await _load_assignment(body.assignment_id)

    # 4. Fetch document text from Google
    try:
        doc_text, updated_token = await google_service.fetch_document_text(
            body.doc_id, token_data, meta=meta
        )
        await redis_service.save_google_token(body.user_id, updated_token)
    except Exception as e:
        err = str(e)
        auth_errors = ("invalid_grant", "Token has been expired", "invalid_token", "Unauthorized")
        if any(k in err for k in auth_errors) or "401" in err.split("HttpError")[0]:
            await redis_service.delete_google_token(body.user_id)
            raise HTTPException(
                401,
                "Google token expired or revoked. Disconnect and reconnect Google in the sidebar.",
            )
        if "403" in err and any(k in err for k in ("accessNotConfigured", "has not been used", "insufficient")):
            raise HTTPException(
                502,
                "Enable Google Drive API and Google Docs API in your Google Cloud project, then reconnect.",
            )
        raise HTTPException(502, f"Could not fetch document from Google: {e}")

    # 5. Score with Claude (prompt caching applied inside claude_service)
    result = await claude_service.score_requirements(assignment, doc_text)

    # 6. Cache and return (keyed by modifiedTime so edits invalidate stale scores)
    result["assignment_id"] = body.assignment_id
    await redis_service.cache_eval_result(
        body.doc_id, body.assignment_id, result, modified_time
    )
    return EvaluateResponse(**result)
