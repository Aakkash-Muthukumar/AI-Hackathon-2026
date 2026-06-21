"""Sync assignment task scores from extension / evaluate results."""
import re
from datetime import datetime
from typing import Optional
from models.schemas import Assignment, Task


def _norm_title(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def apply_eval_to_assignment(assignment: Assignment, result: dict) -> Assignment:
    """Merge Claude requirement scores into assignment.tasks."""
    reqs = result.get("requirements") or {}
    if not reqs or not assignment.tasks:
        if "overall" in result:
            assignment.overall_completion = float(result["overall"])
        assignment.updated_at = datetime.utcnow()
        return assignment

    by_id = {t.id: t for t in assignment.tasks}
    by_title = {t.title.strip().lower(): t for t in assignment.tasks}
    by_norm = {_norm_title(t.title): t for t in assignment.tasks}

    def resolve_task(key: str, req: dict) -> Optional[Task]:
        if key in by_id:
            return by_id[key]
        name = (req.get("name") or "").strip()
        if name:
            lower = name.lower()
            if lower in by_title:
                return by_title[lower]
            nk = _norm_title(name)
            if nk in by_norm:
                return by_norm[nk]
            for task in assignment.tasks:
                tn = _norm_title(task.title)
                if nk and (nk in tn or tn in nk):
                    return task
        k = key.strip().lower()
        if k in by_title:
            return by_title[k]
        nk = _norm_title(key)
        if nk in by_norm:
            return by_norm[nk]
        return None

    matched = 0
    for key, req in reqs.items():
        task = resolve_task(key, req)
        if not task:
            continue
        matched += 1
        task.completion = float(req.get("score", 0))
        missing = req.get("missing") or []
        if isinstance(missing, list):
            task.missing_requirements = [str(m) for m in missing]
        else:
            task.missing_requirements = [str(missing)]

    # Last resort: align by order when counts match but keys didn't match
    if matched == 0 and len(reqs) == len(assignment.tasks):
        for task, req in zip(assignment.tasks, reqs.values()):
            task.completion = float(req.get("score", 0))
            missing = req.get("missing") or []
            task.missing_requirements = (
                [str(m) for m in missing] if isinstance(missing, list) else [str(missing)]
            )
        matched = len(assignment.tasks)

    if "overall" in result:
        assignment.overall_completion = float(result["overall"])
    assignment.updated_at = datetime.utcnow()
    return assignment


def extract_doc_id(document_url: Optional[str]) -> Optional[str]:
    if not document_url:
        return None
    m = re.search(r"/document/d/([a-zA-Z0-9_-]+)", document_url)
    return m.group(1) if m else None


async def merge_doc_eval_into_assignment(assignment: Assignment) -> Assignment:
    """Overlay latest Supabase doc_evaluations scores onto assignment.tasks."""
    from services import supabase_service

    doc_id = extract_doc_id(assignment.document_url)
    stored = None
    if doc_id:
        stored = await supabase_service.get_doc_evaluation(doc_id, assignment.id)
    if not stored:
        stored = await supabase_service.get_latest_doc_evaluation(assignment.id)
    if stored and stored.get("evaluation"):
        assignment = apply_eval_to_assignment(assignment, stored["evaluation"])
    return assignment


def serialize_assignment(assignment: Assignment) -> dict:
    return assignment.model_dump(mode="json")
