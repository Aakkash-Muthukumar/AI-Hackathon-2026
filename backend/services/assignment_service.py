"""
Assignment service: rubric analysis with Redis caching.
"""
from models.schemas import Assignment, Task
from services import claude_service, redis_service, arize_service
from typing import List


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
