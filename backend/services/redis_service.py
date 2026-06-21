import redis.asyncio as aioredis
import json
import time
import os
from typing import Optional

_client: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _client
    if _client is None:
        _client = aioredis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379"),
            decode_responses=True,
        )
    return _client


# ── Assignment cache ─────────────────────────────────────────────────────────

async def cache_assignment(assignment_id: str, data: dict, ttl: int = 3600):
    r = await get_redis()
    await r.setex(f"assignment:{assignment_id}", ttl, json.dumps(data, default=str))


async def get_cached_assignment(assignment_id: str) -> Optional[dict]:
    r = await get_redis()
    raw = await r.get(f"assignment:{assignment_id}")
    return json.loads(raw) if raw else None


async def invalidate_assignment(assignment_id: str):
    r = await get_redis()
    await r.delete(f"assignment:{assignment_id}")


# ── Rubric / task cache (long-lived — rubrics rarely change) ─────────────────

async def cache_rubric_analysis(assignment_id: str, tasks: list, ttl: int = 86400):
    r = await get_redis()
    await r.setex(f"rubric:{assignment_id}", ttl, json.dumps(tasks, default=str))


async def get_cached_rubric_analysis(assignment_id: str) -> Optional[list]:
    r = await get_redis()
    raw = await r.get(f"rubric:{assignment_id}")
    return json.loads(raw) if raw else None


# ── Document snapshot (short-lived — used to detect meaningful changes) ──────

async def store_document_snapshot(assignment_id: str, content: str, ttl: int = 600):
    r = await get_redis()
    await r.setex(f"snapshot:{assignment_id}", ttl, content)


async def get_document_snapshot(assignment_id: str) -> Optional[str]:
    r = await get_redis()
    return await r.get(f"snapshot:{assignment_id}")


def content_changed_enough(old: Optional[str], new: str, threshold: int = 100) -> bool:
    """Return True only if the document changed by at least `threshold` characters."""
    if old is None:
        return True
    return abs(len(new) - len(old)) >= threshold


# ── Progress cache ────────────────────────────────────────────────────────────

async def cache_progress(assignment_id: str, progress: dict, ttl: int = 300):
    r = await get_redis()
    await r.setex(f"progress:{assignment_id}", ttl, json.dumps(progress, default=str))


async def get_cached_progress(assignment_id: str) -> Optional[dict]:
    r = await get_redis()
    raw = await r.get(f"progress:{assignment_id}")
    return json.loads(raw) if raw else None


# ── Browserbase context persistence (keyed by user + platform) ───────────────

async def save_bb_context(user_id: str, platform: str, context_id: str, ttl: int = 30 * 86400):
    """Persist a Browserbase context ID so future syncs reuse the authenticated session."""
    r = await get_redis()
    await r.setex(f"bb_context:{user_id}:{platform}", ttl, context_id)


async def get_bb_context(user_id: str, platform: str) -> Optional[str]:
    r = await get_redis()
    return await r.get(f"bb_context:{user_id}:{platform}")


async def delete_bb_context(user_id: str, platform: str):
    r = await get_redis()
    await r.delete(f"bb_context:{user_id}:{platform}")


async def get_connected_platforms(user_id: str) -> list[str]:
    """Return list of platform names the user has a saved context for."""
    r = await get_redis()
    keys = await r.keys(f"bb_context:{user_id}:*")
    prefix = f"bb_context:{user_id}:"
    return [k[len(prefix):] for k in keys]


# ── Google OAuth token storage ────────────────────────────────────────────────

async def save_google_token(user_id: str, token_data: dict):
    r = await get_redis()
    await r.set(f"google_token:{user_id}", json.dumps(token_data))


async def get_google_token(user_id: str) -> Optional[dict]:
    r = await get_redis()
    raw = await r.get(f"google_token:{user_id}")
    return json.loads(raw) if raw else None


async def delete_google_token(user_id: str):
    r = await get_redis()
    await r.delete(f"google_token:{user_id}")


# ── Evaluate result cache (per doc × assignment, short-lived) ─────────────────

async def cache_eval_result(doc_id: str, assignment_id: str, result: dict, ttl: int = 300):
    r = await get_redis()
    await r.setex(f"eval:{doc_id}:{assignment_id}", ttl, json.dumps(result, default=str))


async def get_cached_eval_result(doc_id: str, assignment_id: str) -> Optional[dict]:
    r = await get_redis()
    raw = await r.get(f"eval:{doc_id}:{assignment_id}")
    return json.loads(raw) if raw else None


# ── Progress history (ring buffer, last 100 entries) ─────────────────────────

async def track_progress_history(assignment_id: str, completion: float):
    r = await get_redis()
    entry = json.dumps({"ts": time.time(), "completion": completion})
    await r.lpush(f"history:{assignment_id}", entry)
    await r.ltrim(f"history:{assignment_id}", 0, 99)


async def get_progress_history(assignment_id: str) -> list:
    r = await get_redis()
    entries = await r.lrange(f"history:{assignment_id}", 0, -1)
    return [json.loads(e) for e in entries]
