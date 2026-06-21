import anthropic
import json
import sentry_sdk
from typing import List
from models.schemas import Assignment, Task

client = anthropic.Anthropic()

_MODEL = "claude-sonnet-4-6"

_RUBRIC_SYSTEM = """You are an expert academic assignment analyzer.
Given an assignment prompt and rubric, break the work into measurable, trackable subtasks.
Each task must have clear success criteria evaluable by reading the submitted text.
Return only valid JSON — no markdown fences, no commentary."""

_PROGRESS_SYSTEM = """You are an expert writing progress evaluator.
Given document content and a list of assignment tasks, score each task 0-100 based on how
well the content addresses the requirement. Be precise and consistent.
Return only valid JSON — no markdown fences, no commentary."""


def _strip_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines).strip()
    return raw


def _call_claude(
    system: str,
    prompt: str,
    max_tokens: int,
    op_name: str,
) -> anthropic.types.Message:
    """
    Calls Claude and wraps the call in a Sentry AI monitoring span.

    Sentry records:
      - op:          "ai.run" — marks this as an LLM inference span
      - model:       the Claude model ID
      - input/output token counts
      - latency (automatic via span timing)
      - any exceptions (captured and re-raised)

    These appear in Sentry's Performance → AI Monitoring view,
    where you can track cost, latency trends, and error rates per operation.
    """
    with sentry_sdk.start_span(op="ai.run", name=op_name) as span:
        span.set_data("ai.model_id", _MODEL)
        span.set_data("ai.input_messages", [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt[:500]},  # truncate for Sentry payload size
        ])
        try:
            response = client.messages.create(
                model=_MODEL,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
            span.set_data("ai.responses", [response.content[0].text[:500]])
            span.set_data("ai.prompt_tokens.used", response.usage.input_tokens)
            span.set_data("ai.completion_tokens.used", response.usage.output_tokens)
            span.set_data("ai.total_tokens.used",
                          response.usage.input_tokens + response.usage.output_tokens)
            return response
        except Exception as e:
            sentry_sdk.capture_exception(e)
            raise


async def analyze_assignment(assignment: Assignment) -> List[Task]:
    """Break an assignment into measurable tasks using its prompt and rubric."""
    prompt = f"""Assignment Title: {assignment.title}

Prompt: {assignment.prompt}

Rubric:
{json.dumps([r.model_dump() for r in assignment.rubric], indent=2)}

Return a JSON array. Each element:
{{
  "id": "task_N",
  "title": "Short task name",
  "completion": 0,
  "success_criteria": ["measurable criterion the text must satisfy"],
  "expected_outputs": ["what the text must contain"],
  "rubric_alignment": ["which rubric criterion this maps to"],
  "missing_requirements": []
}}"""

    with sentry_sdk.start_span(op="ai.pipeline", name="analyze_assignment"):
        response = _call_claude(_RUBRIC_SYSTEM, prompt, 2048, "rubric_analysis")
        tasks_data = json.loads(_strip_fences(response.content[0].text))
        return [Task(**t) for t in tasks_data]


async def score_requirements(assignment: Assignment, document_text: str) -> dict:
    """
    Score how well the document covers each assignment requirement.

    Uses Anthropic prompt caching: the assignment rubric + task list are marked
    as a stable cached prefix. Only the changing document text is billed at full
    input price on repeated calls for the same assignment.

    Returns compact JSON:
      {
        "requirements": {"<task_id>": {"score": 0-100, "missing": [...]}},
        "overall": 0-100
      }
    """
    rubric_text = json.dumps([r.model_dump() for r in assignment.rubric], indent=2)
    task_lines = "\n".join(
        f'  {t.id}: "{t.title}" — criteria: {"; ".join(t.success_criteria[:3])}'
        for t in assignment.tasks
    )

    cached_prefix = f"""You are a precise assignment requirement evaluator.
Do NOT mention word counts, keystroke counts, or document length — only content quality.

Assignment: {assignment.title}

Prompt:
{assignment.prompt[:2000]}

Rubric:
{rubric_text}

Tasks to score:
{task_lines}

Return ONLY compact JSON with no prose, no markdown fences:
{{
  "requirements": {{
    "<task_id>": {{"score": <0-100>, "missing": ["specific missing element", ...]}},
    ...
  }},
  "overall": <0-100>
}}"""

    with sentry_sdk.start_span(op="ai.pipeline", name="score_requirements"):
        with sentry_sdk.start_span(op="ai.run", name="requirement_scoring") as span:
            span.set_data("ai.model_id", _MODEL)
            span.set_data("ai.input_messages", [
                {"role": "system", "content": cached_prefix[:500]},
                {"role": "user", "content": document_text[:200]},
            ])
            try:
                response = client.messages.create(
                    model=_MODEL,
                    max_tokens=1024,
                    system=[
                        {
                            "type": "text",
                            "text": cached_prefix,
                            "cache_control": {"type": "ephemeral"},
                        }
                    ],
                    messages=[
                        {
                            "role": "user",
                            "content": f"Document text:\n\n{document_text[:12000]}",
                        }
                    ],
                )
                span.set_data("ai.responses", [response.content[0].text[:500]])
                span.set_data("ai.prompt_tokens.used", response.usage.input_tokens)
                span.set_data("ai.completion_tokens.used", response.usage.output_tokens)
                result = json.loads(_strip_fences(response.content[0].text))
                # Derive overall if not returned
                if "overall" not in result and result.get("requirements"):
                    scores = [v.get("score", 0) for v in result["requirements"].values()]
                    result["overall"] = round(sum(scores) / len(scores), 1) if scores else 0.0
                return result
            except Exception as e:
                sentry_sdk.capture_exception(e)
                raise


async def evaluate_progress(content: str, tasks: List[Task], assignment: Assignment) -> List[Task]:
    """Score each task 0-100 against the current document content."""
    prompt = f"""Assignment: {assignment.title}

Tasks:
{json.dumps([t.model_dump() for t in tasks], indent=2)}

Document content (first 8 000 chars):
{content[:8000]}

Return the same JSON array with updated:
- completion: 0-100 (how well this task is addressed)
- missing_requirements: list of what is still needed to satisfy this task"""

    with sentry_sdk.start_span(op="ai.pipeline", name="evaluate_progress"):
        response = _call_claude(_PROGRESS_SYSTEM, prompt, 2048, "progress_evaluation")
        updated = json.loads(_strip_fences(response.content[0].text))
        return [Task(**t) for t in updated]
