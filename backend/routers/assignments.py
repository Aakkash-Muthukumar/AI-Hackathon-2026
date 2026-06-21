from fastapi import APIRouter, HTTPException, Header, Query
from typing import Optional
import logging
from models.schemas import Assignment, AssignmentCreate, ProgressUpdateRequest, AssignmentStatus
from services import supabase_service, redis_service, assignment_service, progress_service, rubric_vector_service
from services.assignment_sync import serialize_assignment, merge_doc_eval_into_assignment
from datetime import datetime
import uuid

router = APIRouter(prefix="/assignments", tags=["assignments"])
logger = logging.getLogger(__name__)


@router.get("/", response_model=list[Assignment])
async def list_assignments(x_user_id: Optional[str] = Header(None)):
    rows = await supabase_service.list_assignments(user_id=x_user_id)
    return [Assignment(**r) for r in rows]


@router.post("/", response_model=Assignment)
async def create_assignment(body: AssignmentCreate, x_user_id: Optional[str] = Header(None)):
    assignment = Assignment(id=str(uuid.uuid4()), user_id=x_user_id, **body.model_dump())
    try:
        assignment.tasks = await assignment_service.analyze_rubric(assignment)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not analyze assignment rubric: {exc}",
        )

    assignment = await assignment_service.maybe_attach_google_doc(assignment, x_user_id)

    data = serialize_assignment(assignment)
    await supabase_service.upsert_assignment(data)
    await redis_service.cache_assignment(assignment.id, data)
    return assignment


@router.get("/{assignment_id}", response_model=Assignment)
async def get_assignment(assignment_id: str, fresh: bool = Query(False)):
    row = None
    if not fresh:
        cached = await redis_service.get_cached_assignment(assignment_id)
        if cached:
            assignment = Assignment(**cached)
            assignment = await merge_doc_eval_into_assignment(assignment)
            return assignment

    row = await supabase_service.get_assignment(assignment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment = Assignment(**row)
    assignment = await merge_doc_eval_into_assignment(assignment)

    data = serialize_assignment(assignment)
    await redis_service.cache_assignment(assignment_id, data)
    return assignment


@router.post("/{assignment_id}/create-document", response_model=Assignment)
async def create_assignment_document(
    assignment_id: str,
    x_user_id: Optional[str] = Header(None),
):
    """Create a Google Doc for an assignment that does not have one yet."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")

    row = await supabase_service.get_assignment(assignment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment = Assignment(**row)
    if assignment.document_url:
        return assignment

    token_data = await redis_service.get_google_token(x_user_id)
    if not token_data:
        raise HTTPException(
            status_code=400,
            detail="Connect Google first from the dashboard or new assignment page.",
        )

    assignment = await assignment_service.maybe_attach_google_doc(assignment, x_user_id)
    if not assignment.document_url:
        raise HTTPException(status_code=502, detail="Could not create Google Doc")

    assignment.updated_at = datetime.utcnow()
    data = serialize_assignment(assignment)
    await supabase_service.upsert_assignment(data)
    await redis_service.cache_assignment(assignment_id, data)
    return assignment


@router.post("/{assignment_id}/progress", response_model=Assignment)
async def update_progress(assignment_id: str, body: ProgressUpdateRequest):
    row = await supabase_service.get_assignment(assignment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment = Assignment(**row)
    assignment = await progress_service.evaluate(assignment, body.document_content)
    assignment.updated_at = datetime.utcnow()

    data = serialize_assignment(assignment)
    await supabase_service.upsert_assignment(data)
    await redis_service.cache_assignment(assignment_id, data)
    return assignment


@router.get("/{assignment_id}/history")
async def progress_history(assignment_id: str):
    history = await redis_service.get_progress_history(assignment_id)
    return {"assignment_id": assignment_id, "history": history}


@router.post("/{assignment_id}/complete", response_model=Assignment)
async def mark_complete(assignment_id: str):
    row = await supabase_service.get_assignment(assignment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment = Assignment(**row)
    assignment.status = AssignmentStatus.COMPLETED
    assignment.overall_completion = 100.0
    for task in assignment.tasks:
        task.completion = 100.0
        task.missing_requirements = []
    assignment.updated_at = datetime.utcnow()

    data = serialize_assignment(assignment)
    await supabase_service.upsert_assignment(data)
    await redis_service.cache_assignment(assignment_id, data)
    return assignment


@router.delete("/{assignment_id}", status_code=204)
async def delete_assignment(assignment_id: str):
    """Remove the assignment record only — never deletes the linked Google Doc."""
    await supabase_service.delete_assignment(assignment_id)
    await redis_service.invalidate_assignment(assignment_id)
    await rubric_vector_service.delete_assignment_vectors(assignment_id)
