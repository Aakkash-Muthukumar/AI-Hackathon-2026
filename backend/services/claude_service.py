import anthropic
import json
import logging
import sentry_sdk
from typing import List, Any
from models.schemas import Assignment, Task, GuidanceLevel

client = anthropic.Anthropic()
logger = logging.getLogger(__name__)

_MODEL = "claude-sonnet-4-6"

_GUIDANCE_HINTS = {
    GuidanceLevel.LOW: (
        "Guidance: LOW — keep the breakdown minimal. Only split into separate tasks when "
        "the assignment clearly has distinct major parts. Prefer fewer, broader milestones."
    ),
    GuidanceLevel.MEDIUM: (
        "Guidance: MEDIUM — balanced breakdown. Cover every major rubric area with a "
        "sensible number of tasks; split only where it helps the student track progress."
    ),
    GuidanceLevel.HIGH: (
        "Guidance: HIGH — thorough breakdown. Split complex requirements into granular, "
        "trackable steps wherever the assignment complexity warrants it."
    ),
}

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


def _parse_json(raw: str) -> Any:
    """Parse Claude JSON output, salvaging truncated arrays when possible."""
    text = _strip_fences(raw)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Salvage a truncated JSON array by closing after the last complete object.
    start = text.find("[")
    if start != -1:
        fragment = text[start:]
        last_obj = fragment.rfind("}")
        if last_obj != -1:
            try:
                return json.loads(fragment[: last_obj + 1] + "]")
            except json.JSONDecodeError:
                pass

    # Salvage a truncated JSON object similarly.
    start = text.find("{")
    if start != -1:
        fragment = text[start:]
        depth = 0
        end = -1
        for i, ch in enumerate(fragment):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = i
        if end != -1:
            try:
                return json.loads(fragment[: end + 1])
            except json.JSONDecodeError:
                pass

    raise json.JSONDecodeError("Could not parse Claude JSON response", text, 0)


def _normalize_task(raw: dict, index: int) -> dict:
    """Ensure required Task fields exist with sane defaults."""
    task = dict(raw)
    task.setdefault("id", f"task_{index + 1}")
    task.setdefault("title", f"Requirement {index + 1}")
    task.setdefault("completion", 0)
    for key in ("success_criteria", "expected_outputs", "rubric_alignment", "missing_requirements"):
        val = task.get(key)
        if val is None:
            task[key] = []
        elif isinstance(val, str):
            task[key] = [val]
    return task


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
    rubric_payload = [r.model_dump() for r in assignment.rubric]
    rubric_json = json.dumps(rubric_payload, indent=2)
    if len(rubric_json) > 6000:
        rubric_json = rubric_json[:6000] + "\n...(rubric truncated for analysis)"

    guidance_hint = _GUIDANCE_HINTS.get(
        assignment.guidance_level, _GUIDANCE_HINTS[GuidanceLevel.MEDIUM]
    )

    prompt = f"""Assignment Title: {assignment.title}

Prompt:
{assignment.prompt[:4000]}

Rubric:
{rubric_json}

{guidance_hint}

Decide the number of tasks subjectively based on the assignment complexity and guidance level above.
Do not pad with extra tasks — each task must map to something real in the prompt or rubric.
Keep every string under 80 characters. Each task needs only 2-3 short success_criteria bullets.

Each element:
{{
  "id": "task_1",
  "title": "Short task name",
  "completion": 0,
  "success_criteria": ["short measurable criterion"],
  "expected_outputs": ["what the text must contain"],
  "rubric_alignment": ["rubric criterion name"],
  "missing_requirements": []
}}

Return ONLY the JSON array — no markdown fences, no commentary."""

    compact_prompt = (
        prompt
        + "\n\nIMPORTANT: Response was truncated. Return fewer tasks with VERY short strings."
    )

    with sentry_sdk.start_span(op="ai.pipeline", name="analyze_assignment"):
        response = _call_claude(_RUBRIC_SYSTEM, prompt, 4096, "rubric_analysis")
        raw_text = response.content[0].text

        if response.stop_reason == "max_tokens":
            logger.warning("Rubric analysis hit max_tokens — retrying with compact prompt")
            response = _call_claude(_RUBRIC_SYSTEM, compact_prompt, 4096, "rubric_analysis_compact")
            raw_text = response.content[0].text

        try:
            tasks_data = _parse_json(raw_text)
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse rubric JSON: %s", exc)
            sentry_sdk.capture_exception(exc)
            raise ValueError(
                "AI returned invalid rubric analysis. Try a shorter prompt/rubric or retry."
            ) from exc

        if not isinstance(tasks_data, list):
            raise ValueError("AI rubric analysis did not return a JSON array of tasks.")

        if not tasks_data:
            raise ValueError("AI returned no tasks for this assignment.")

        return [Task(**_normalize_task(t, i)) for i, t in enumerate(tasks_data)]


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

Tasks to score (use the exact id string as each JSON key):
{task_lines}

Return ONLY compact JSON with no prose, no markdown fences:
{{
  "requirements": {{
    "<exact task id from list above>": {{
      "name": "<task title exactly as given above>",
      "score": <0-100>,
      "missing": ["short casual gap — 2 to 6 words, plain language, lead with the gap"]
    }},
    ...
  }},
  "overall": <0-100>
}}

CRITICAL: Every task id listed above must appear as a key in "requirements".

Rules for "missing" entries:
- 2 to 6 words only — fragments, not sentences
- Plain everyday language, no academic jargon
- Lead with what's missing, e.g. "No thesis yet", "Missing counterargument", "Evidence too vague", "Conclusion needed"
- Do NOT write "The essay does not..." or "This section lacks..."
"""

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
                result = _parse_json(response.content[0].text)
                # Derive overall if not returned
                if "overall" not in result and result.get("requirements"):
                    scores = [v.get("score", 0) for v in result["requirements"].values()]
                    result["overall"] = round(sum(scores) / len(scores), 1) if scores else 0.0
                # Backfill name from task list if Claude omitted it
                id_to_name = {t.id: t.title for t in assignment.tasks}
                for task_id, req in result.get("requirements", {}).items():
                    if not req.get("name"):
                        req["name"] = id_to_name.get(task_id, task_id)
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
        updated = _parse_json(response.content[0].text)
        return [Task(**_normalize_task(t, i)) for i, t in enumerate(updated)]
