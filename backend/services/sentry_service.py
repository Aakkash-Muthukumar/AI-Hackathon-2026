"""
Sentry observability — errors, performance, and AI monitoring across Scaffold.

Used by: FastAPI backend (all routes), Claude calls (ai.run spans), Browserbase,
Supabase, and Google API failures.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

_initialized = False


def init() -> bool:
    """Initialize Sentry once at startup. Returns True when the DSN is active."""
    global _initialized
    if _initialized:
        return is_enabled()

    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn or "..." in dsn:
        logger.info("Sentry disabled (set SENTRY_DSN to enable)")
        _initialized = True
        return False

    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.httpx import HttpxIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration
    from sentry_sdk.integrations.redis import RedisIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("ENVIRONMENT", "development"),
        release=os.getenv("SENTRY_RELEASE", "scaffold-backend@1.0.0"),
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
            RedisIntegration(),
            HttpxIntegration(),
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
        ],
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "1.0")),
        profiles_sample_rate=float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.1")),
        send_default_pii=False,
    )
    _initialized = True
    logger.info("Sentry initialized (errors + traces + AI spans + Redis/httpx)")
    return True


def is_enabled() -> bool:
    if not _initialized:
        return False
    import sentry_sdk

    try:
        return sentry_sdk.get_client() is not None
    except Exception:
        return False


def set_user(user_id: Optional[str]) -> None:
    if not user_id or not is_enabled():
        return
    import sentry_sdk

    sentry_sdk.set_user({"id": user_id})


def add_breadcrumb(
    category: str,
    message: str,
    *,
    level: str = "info",
    data: Optional[dict[str, Any]] = None,
) -> None:
    if not is_enabled():
        return
    import sentry_sdk

    sentry_sdk.add_breadcrumb(
        category=category,
        message=message,
        level=level,
        data=data or {},
    )


def capture_exception(
    exc: BaseException,
    *,
    tags: Optional[dict[str, str]] = None,
    context: Optional[dict[str, Any]] = None,
) -> None:
    if not is_enabled():
        return
    import sentry_sdk

    with sentry_sdk.push_scope() as scope:
        if tags:
            for key, value in tags.items():
                scope.set_tag(key, value)
        if context:
            scope.set_context("details", context)
        sentry_sdk.capture_exception(exc)


def capture_pipeline_error(
    exc: BaseException,
    *,
    pipeline: str,
    **context: Any,
) -> None:
    """Tag failures in multi-step flows (discovery, eval, rubric analysis)."""
    capture_exception(
        exc,
        tags={"pipeline": pipeline},
        context={"pipeline": pipeline, **context},
    )
