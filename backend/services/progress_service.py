"""
Progress service: document evaluation with Redis snapshot + vector guards.

Skips Claude when the document is unchanged by character count OR semantic
similarity (Redis Stack vector embeddings).
"""
from models.schemas import Assignment
from services import claude_service, redis_service, arize_service, rubric_vector_service


async def evaluate(assignment: Assignment, content: str) -> Assignment:
    snapshot = await redis_service.get_document_snapshot(assignment.id)
    char_unchanged = not redis_service.content_changed_enough(snapshot, content)

    current_embedding = await rubric_vector_service.embed_text(content[:4000])
    previous_embedding = await rubric_vector_service.get_document_embedding(assignment.id)
    semantic_unchanged = rubric_vector_service.is_semantically_unchanged(
        previous_embedding, current_embedding
    )

    if char_unchanged or semantic_unchanged:
        cached = await redis_service.get_cached_progress(assignment.id)
        if cached:
            from models.schemas import Task
            assignment.tasks = [Task(**t) for t in cached["tasks"]]
            assignment.overall_completion = cached["overall_completion"]
            return assignment

    retrieval_hits = await rubric_vector_service.retrieve_relevant(
        assignment.id, content, top_k=min(6, max(len(assignment.tasks), 1))
    )
    if not retrieval_hits and assignment.tasks:
        await rubric_vector_service.index_assignment(assignment, assignment.tasks)
        retrieval_hits = await rubric_vector_service.retrieve_relevant(
            assignment.id, content, top_k=min(6, max(len(assignment.tasks), 1))
        )

    updated_tasks = await claude_service.evaluate_progress(
        content, assignment.tasks, assignment, retrieval_hits=retrieval_hits
    )
    assignment.tasks = updated_tasks

    total = sum(t.completion for t in updated_tasks)
    assignment.overall_completion = total / len(updated_tasks) if updated_tasks else 0.0

    await redis_service.store_document_snapshot(assignment.id, content)
    await rubric_vector_service.store_document_embedding(assignment.id, content)
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
