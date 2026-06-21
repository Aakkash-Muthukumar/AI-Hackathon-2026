import logging
from fastapi import APIRouter, HTTPException
from models.schemas import EvaluateRequest, EvaluateResponse, Assignment
from services import redis_service, google_service, claude_service, supabase_service

router = APIRouter(prefix="/evaluate", tags=["evaluate"])
logger = logging.getLogger(__name__)


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
      2. Get Drive file metadata (returns unavailable response on 404/notFound).
      3. Check Redis fast cache, then Supabase persistent cache — skip Claude if unchanged.
      4. Load the assignment (Redis → Supabase).
      5. Fetch document plain text — return zero scores on empty docs, not a Claude call.
      6. Call Claude with prompt-cached rubric prefix.
      7. Persist result to Supabase + update assignment overall_completion.
      8. Cache to Redis and return scores.
    """
    # 1. Token check
    token_data = await redis_service.get_google_token(body.user_id)
    if not token_data:
        raise HTTPException(
            401,
            "Google account not connected. "
            f"Visit /auth/google/authorize?user_id={body.user_id} to authorize.",
        )

    # 2. Get Drive modifiedTime — gracefully handle not-found docs
    try:
        meta, token_data = await google_service.get_file_metadata(body.doc_id, token_data)
        await redis_service.save_google_token(body.user_id, token_data)
    except google_service.DriveFileNotFoundError:
        logger.info(
            "Drive 404 for doc_id=%s user=%s — wrong account or doc not yet saved",
            body.doc_id, body.user_id,
        )
        return EvaluateResponse(
            requirements={},
            overall=0.0,
            assignment_id=body.assignment_id,
            unavailable_reason="not_found",
        )
    except Exception as e:
        raise HTTPException(502, f"Could not read document metadata from Google: {e}")

    modified_time = meta.get("modifiedTime", "")

    # 3a. Redis fast cache (120-s TTL)
    cached = await redis_service.get_cached_eval_result(body.doc_id, body.assignment_id)
    if cached and cached.get("modified_time") == modified_time and cached.get("result"):
        return EvaluateResponse(**cached["result"])

    # 3b. Supabase persistent cache — avoids Claude call when the doc hasn't changed
    stored = await supabase_service.get_doc_evaluation(body.doc_id, body.assignment_id)
    if stored and stored.get("doc_marker") == modified_time and stored.get("evaluation"):
        eval_data = dict(stored["evaluation"])
        eval_data["assignment_id"] = body.assignment_id
        await redis_service.cache_eval_result(
            body.doc_id, body.assignment_id, eval_data, modified_time
        )
        return EvaluateResponse(**eval_data)

    # 4. Assignment
    assignment = await _load_assignment(body.assignment_id)

    # 5. Fetch document text from Google
    try:
        doc_text, updated_token = await google_service.fetch_document_text(
            body.doc_id, token_data, meta=meta
        )
        await redis_service.save_google_token(body.user_id, updated_token)
    except google_service.DriveFileNotFoundError:
        return EvaluateResponse(
            requirements={},
            overall=0.0,
            assignment_id=body.assignment_id,
            unavailable_reason="not_found",
        )
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

    # Skip Claude on empty documents — return all requirements at 0%
    if not doc_text or not doc_text.strip():
        logger.info(
            "Empty doc for doc_id=%s assignment=%s — returning zero scores", body.doc_id, body.assignment_id
        )
        zero_reqs = (
            {t.id: {"name": t.title, "score": 0, "missing": []} for t in assignment.tasks}
            if assignment.tasks else {}
        )
        return EvaluateResponse(
            requirements=zero_reqs,
            overall=0.0,
            assignment_id=body.assignment_id,
        )

    # 6. Score with Claude (prompt caching applied inside claude_service)
    result = await claude_service.score_requirements(assignment, doc_text)
    result["assignment_id"] = body.assignment_id

    # 7. Persist — Supabase for long-term, Redis for fast reads
    try:
        await supabase_service.upsert_doc_evaluation(
            body.doc_id, body.assignment_id, result, modified_time
        )
        await supabase_service.update_assignment_completion(
            body.assignment_id, result.get("overall", 0)
        )
    except Exception as exc:
        logger.warning("Could not persist eval to Supabase: %s", exc)

    # 8. Cache and return
    await redis_service.cache_eval_result(
        body.doc_id, body.assignment_id, result, modified_time
    )
    return EvaluateResponse(**result)
