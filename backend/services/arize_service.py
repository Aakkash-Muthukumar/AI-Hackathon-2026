"""
Arize Phoenix observability integration.
Instruments Anthropic calls automatically via OpenInference and adds
custom spans for rubric extraction quality and progress evaluation accuracy.
"""
import os
import logging
from typing import Any

logger = logging.getLogger(__name__)
_initialized = False


def initialize():
    """Call once at startup to wire up Phoenix tracing."""
    global _initialized
    if _initialized:
        return

    try:
        from phoenix.otel import register
        from openinference.instrumentation.anthropic import AnthropicInstrumentor

        endpoint = os.getenv(
            "PHOENIX_COLLECTOR_ENDPOINT", "http://localhost:6006/v1/traces"
        )
        api_key = os.getenv("PHOENIX_API_KEY")

        kwargs: dict[str, Any] = {"project_name": "scaffold", "endpoint": endpoint}
        if api_key:
            kwargs["headers"] = {"api_key": api_key}

        tracer_provider = register(**kwargs)
        AnthropicInstrumentor().instrument(tracer_provider=tracer_provider)
        _initialized = True
        logger.info("Arize Phoenix initialized → %s", endpoint)
    except Exception as e:
        logger.warning("Arize Phoenix init failed (non-fatal): %s", e)


def _tracer():
    from opentelemetry import trace
    return trace.get_tracer("scaffold")


def record_rubric_extraction(
    assignment_id: str, rubric_item_count: int, task_count: int
):
    """Span: rubric → task decomposition quality."""
    try:
        with _tracer().start_as_current_span("rubric_extraction") as span:
            span.set_attribute("assignment.id", assignment_id)
            span.set_attribute("rubric.items", rubric_item_count)
            span.set_attribute("tasks.generated", task_count)
            span.set_attribute(
                "coverage_ratio", task_count / max(rubric_item_count, 1)
            )
    except Exception:
        pass


def record_progress_evaluation(
    assignment_id: str, task_scores: dict, overall: float
):
    """Span: completion estimation per task."""
    try:
        with _tracer().start_as_current_span("progress_evaluation") as span:
            span.set_attribute("assignment.id", assignment_id)
            span.set_attribute("overall_completion", overall)
            for tid, score in task_scores.items():
                span.set_attribute(f"task.{tid}.score", score)
    except Exception:
        pass


