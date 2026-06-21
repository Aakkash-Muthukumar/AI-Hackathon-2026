"""
Assignment service: rubric analysis with Redis caching.
"""
import logging
from typing import List, Optional

from models.schemas import Assignment, Task
from services import claude_service, redis_service, arize_service, google_service

logger = logging.getLogger(__name__)


async def maybe_attach_google_doc(assignment: Assignment, user_id: Optional[str]) -> Assignment:
    """Create a Google Doc for the assignment when the user has Google connected."""
    if assignment.document_url or not user_id:
        return assignment
    token_data = await redis_service.get_google_token(user_id)
    if not token_data:
        return assignment
    try:
        _, url, updated_token = await google_service.create_document(assignment.title, token_data)
        await redis_service.save_google_token(user_id, updated_token)
        assignment.document_url = url
    except Exception as exc:
        logger.warning(
            "Google Doc creation failed for assignment %s: %s", assignment.id, exc
        )
    return assignment


async def analyze_rubric(assignment: Assignment) -> List[Task]:
    """Return tasks for an assignment, hitting Redis before calling Claude."""
    cached = await redis_service.get_cached_rubric_analysis(assignment.id)
    if cached:
        return [Task(**t) for t in cached]

    tasks = await claude_service.analyze_assignment(assignment)

    await redis_service.cache_rubric_analysis(
        assignment.id, [t.model_dump() for t in tasks]
    )

    arize_service.record_rubric_extraction(
        assignment_id=assignment.id,
        rubric_item_count=len(assignment.rubric),
        task_count=len(tasks),
    )

    return tasks
