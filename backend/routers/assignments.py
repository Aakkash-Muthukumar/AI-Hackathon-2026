from fastapi import APIRouter, HTTPException
from models.schemas import Assignment, AssignmentCreate, ProgressUpdateRequest
from services import supabase_service, redis_service, assignment_service, progress_service
from datetime import datetime
import uuid

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.get("/", response_model=list[Assignment])
async def list_assignments():
    rows = await supabase_service.list_assignments()
    return [Assignment(**r) for r in rows]


@router.post("/", response_model=Assignment)
async def create_assignment(body: AssignmentCreate):
    assignment = Assignment(id=str(uuid.uuid4()), **body.model_dump())
    assignment.tasks = await assignment_service.analyze_rubric(assignment)

    data = _serialize(assignment)
    await supabase_service.upsert_assignment(data)
    await redis_service.cache_assignment(assignment.id, data)
    return assignment


@router.get("/{assignment_id}", response_model=Assignment)
async def get_assignment(assignment_id: str):
    cached = await redis_service.get_cached_assignment(assignment_id)
    if cached:
        return Assignment(**cached)

    row = await supabase_service.get_assignment(assignment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    await redis_service.cache_assignment(assignment_id, row)
    return Assignment(**row)


@router.post("/{assignment_id}/progress", response_model=Assignment)
async def update_progress(assignment_id: str, body: ProgressUpdateRequest):
    row = await supabase_service.get_assignment(assignment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment = Assignment(**row)
    assignment = await progress_service.evaluate(assignment, body.document_content)
    assignment.updated_at = datetime.utcnow()

    data = _serialize(assignment)
    await supabase_service.upsert_assignment(data)
    await redis_service.cache_assignment(assignment_id, data)
    return assignment


@router.get("/{assignment_id}/history")
async def progress_history(assignment_id: str):
    history = await redis_service.get_progress_history(assignment_id)
    return {"assignment_id": assignment_id, "history": history}


@router.delete("/{assignment_id}", status_code=204)
async def delete_assignment(assignment_id: str):
    await supabase_service.delete_assignment(assignment_id)
    await redis_service.invalidate_assignment(assignment_id)


def _serialize(assignment: Assignment) -> dict:
    data = assignment.model_dump()
    data["created_at"] = data["created_at"].isoformat()
    data["updated_at"] = data["updated_at"].isoformat()
    if data.get("deadline"):
        data["deadline"] = data["deadline"].isoformat()
    return data
