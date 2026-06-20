"""
Progress service: document evaluation with Redis snapshot guard.
Skips Claude if the document hasn't changed by ≥100 chars since last eval.
"""
from models.schemas import Assignment
from services import claude_service, redis_service, arize_service


async def evaluate(assignment: Assignment, content: str) -> Assignment:
    snapshot = await redis_service.get_document_snapshot(assignment.id)
    if not redis_service.content_changed_enough(snapshot, content):
        cached = await redis_service.get_cached_progress(assignment.id)
        if cached:
            from models.schemas import Task
            assignment.tasks = [Task(**t) for t in cached["tasks"]]
            assignment.overall_completion = cached["overall_completion"]
            return assignment

    updated_tasks = await claude_service.evaluate_progress(content, assignment.tasks, assignment)
    assignment.tasks = updated_tasks

    total = sum(t.completion for t in updated_tasks)
    assignment.overall_completion = total / len(updated_tasks) if updated_tasks else 0.0

    await redis_service.store_document_snapshot(assignment.id, content)
    await redis_service.cache_progress(
        assignment.id,
        {
            "tasks": [t.model_dump() for t in updated_tasks],
            "overall_completion": assignment.overall_completion,
        },
    )
    await redis_service.track_progress_history(assignment.id, assignment.overall_completion)

    arize_service.record_progress_evaluation(
        assignment_id=assignment.id,
        task_scores={t.id: t.completion for t in updated_tasks},
        overall=assignment.overall_completion,
    )

    return assignment
