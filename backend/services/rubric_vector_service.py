"""
Redis Stack vector index for rubric + task retrieval.

Indexes each rubric criterion and task as an embedding (fastembed, 384-dim).
At evaluation time, document text is embedded and matched via RediSearch KNN
so Claude receives semantically relevant requirements first.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Optional

import numpy as np
from redis.commands.search.field import TagField, TextField, VectorField
from redis.commands.search.index_definition import IndexDefinition, IndexType
from redis.commands.search.query import Query
from redis.exceptions import ResponseError

from models.schemas import Assignment, RubricItem, Task
from services.redis_service import get_redis

logger = logging.getLogger(__name__)

INDEX_NAME = "idx:rubric"
KEY_PREFIX = "rubric_vec:"
EMBEDDING_DIM = 384
EMBEDDING_MODEL = os.getenv("RUBRIC_EMBED_MODEL", "BAAI/bge-small-en-v1.5")
SEMANTIC_UNCHANGED_THRESHOLD = float(os.getenv("SEMANTIC_UNCHANGED_THRESHOLD", "0.97"))

_index_ready = False
_search_available: Optional[bool] = None
_embedder = None


def _task_text(task: Task) -> str:
    parts = [task.title, *task.success_criteria, *task.expected_outputs, *task.rubric_alignment]
    return " | ".join(p for p in parts if p)


def _rubric_text(item: RubricItem) -> str:
    return f"{item.criterion}: {item.description}"


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _to_bytes(vec: list[float]) -> bytes:
    return np.array(vec, dtype=np.float32).tobytes()


def _get_embedder():
    global _embedder
    if _embedder is None:
        from fastembed import TextEmbedding

        _embedder = TextEmbedding(model_name=EMBEDDING_MODEL)
    return _embedder


def _embed_sync(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = _get_embedder()
    return [vec.tolist() for vec in model.embed(texts)]


async def embed_texts(texts: list[str]) -> list[list[float]]:
    return await asyncio.to_thread(_embed_sync, texts)


async def embed_text(text: str) -> list[float]:
    vectors = await embed_texts([text])
    return vectors[0] if vectors else []


def is_semantically_unchanged(
    previous: Optional[list[float]],
    current: list[float],
    threshold: float = SEMANTIC_UNCHANGED_THRESHOLD,
) -> bool:
    if not previous or not current:
        return False
    return cosine_similarity(previous, current) >= threshold


async def ensure_index() -> bool:
    """Create the RediSearch vector index if Redis Stack is available."""
    global _index_ready, _search_available
    if _index_ready:
        return bool(_search_available)

    r = await get_redis()
    schema = (
        TagField("assignment_id"),
        TagField("item_id"),
        TagField("item_type"),
        TextField("text"),
        VectorField(
            "embedding",
            "HNSW",
            {
                "TYPE": "FLOAT32",
                "DIM": EMBEDDING_DIM,
                "DISTANCE_METRIC": "COSINE",
            },
        ),
    )
    try:
        await r.ft(INDEX_NAME).create_index(
            schema,
            definition=IndexDefinition(prefix=[KEY_PREFIX], index_type=IndexType.HASH),
        )
        _search_available = True
        logger.info("Redis Stack rubric vector index ready (%s)", INDEX_NAME)
    except ResponseError as exc:
        msg = str(exc).lower()
        if "index already exists" in msg:
            _search_available = True
        elif "unknown command" in msg or "unknown index" in msg or "module" in msg:
            _search_available = False
            logger.warning(
                "Redis Search unavailable — rubric vector retrieval disabled. "
                "Use redis/redis-stack-server instead of plain redis. (%s)",
                exc,
            )
        else:
            raise
    except Exception as exc:
        _search_available = False
        logger.warning("Could not initialize rubric vector index: %s", exc)

    _index_ready = True
    return bool(_search_available)


async def delete_assignment_vectors(assignment_id: str) -> None:
    if not await ensure_index():
        return
    r = await get_redis()
    pattern = f"{KEY_PREFIX}{assignment_id}:*"
    keys = [key async for key in r.scan_iter(match=pattern, count=200)]
    if keys:
        await r.delete(*keys)


async def index_assignment(assignment: Assignment, tasks: list[Task]) -> int:
    """Embed and store rubric items + tasks for vector retrieval."""
    if not await ensure_index():
        return 0

    await delete_assignment_vectors(assignment.id)

    items: list[tuple[str, str, str]] = []
    for task in tasks:
        items.append((task.id, "task", _task_text(task)))
    for idx, rubric in enumerate(assignment.rubric):
        items.append((f"rubric_{idx}", "rubric", _rubric_text(rubric)))

    if not items:
        return 0

    texts = [text for _, _, text in items]
    vectors = await embed_texts(texts)
    r = await get_redis()

    pipe = r.pipeline()
    for (item_id, item_type, text), vector in zip(items, vectors):
        key = f"{KEY_PREFIX}{assignment.id}:{item_id}"
        pipe.hset(
            key,
            mapping={
                "assignment_id": assignment.id,
                "item_id": item_id,
                "item_type": item_type,
                "text": text[:2000],
                "embedding": _to_bytes(vector),
            },
        )
    await pipe.execute()
    logger.info(
        "Indexed %d rubric vector(s) for assignment %s",
        len(items),
        assignment.id,
    )
    return len(items)


async def retrieve_relevant(
    assignment_id: str,
    document_text: str,
    top_k: int = 6,
) -> list[dict[str, Any]]:
    """
    KNN search: return rubric/task items most similar to the document excerpt.
    Each hit: {item_id, item_type, text, score} where score is cosine similarity.
    """
    if not await ensure_index() or not document_text.strip():
        return []

    excerpt = document_text[:4000]
    vector = await embed_text(excerpt)
    if not vector:
        return []

    r = await get_redis()
    k = max(top_k, 1)
    q = (
        Query(f"(@assignment_id:{{{assignment_id}}})=>[KNN {k} @embedding $vec AS vector_score]")
        .sort_by("vector_score")
        .return_fields("item_id", "item_type", "text", "vector_score")
        .dialect(2)
    )

    try:
        result = await r.ft(INDEX_NAME).search(q, query_params={"vec": _to_bytes(vector)})
    except ResponseError as exc:
        logger.warning("Rubric vector search failed for %s: %s", assignment_id, exc)
        return []

    hits: list[dict[str, Any]] = []
    for doc in result.docs:
        raw_score = float(getattr(doc, "vector_score", 0))
        # RediSearch COSINE distance: 0 = identical; convert to similarity.
        similarity = max(0.0, 1.0 - raw_score)
        hits.append(
            {
                "item_id": doc.item_id,
                "item_type": doc.item_type,
                "text": doc.text,
                "score": round(similarity, 4),
            }
        )
    hits.sort(key=lambda h: h["score"], reverse=True)
    return hits


def format_retrieval_context(hits: list[dict[str, Any]]) -> str:
    if not hits:
        return ""
    lines = [
        "Redis vector search — requirements most relevant to the current document:",
    ]
    for hit in hits:
        label = "Task" if hit["item_type"] == "task" else "Rubric"
        lines.append(
            f'- [{label} {hit["item_id"]}] (similarity {hit["score"]:.2f}): {hit["text"][:200]}'
        )
    return "\n".join(lines)


async def store_document_embedding(assignment_id: str, content: str, ttl: int = 600) -> None:
    vector = await embed_text(content[:4000])
    if not vector:
        return
    r = await get_redis()
    await r.setex(
        f"doc_emb:{assignment_id}",
        ttl,
        json.dumps(vector),
    )


async def get_document_embedding(assignment_id: str) -> Optional[list[float]]:
    r = await get_redis()
    raw = await r.get(f"doc_emb:{assignment_id}")
    return json.loads(raw) if raw else None
