"""
Debug routes for hackathon demos (Sentry, etc.). Disabled in production unless
ALLOW_SENTRY_DEBUG=true.
"""
import os

import sentry_sdk
from fastapi import APIRouter, HTTPException, Query, Request

from services import sentry_service

router = APIRouter(prefix="/debug", tags=["debug"])


def _demo_allowed() -> bool:
    env = os.getenv("ENVIRONMENT", "development").lower()
    if env == "production":
        return os.getenv("ALLOW_SENTRY_DEBUG", "").lower() in ("1", "true", "yes")
    return True


@router.post("/sentry-test")
async def sentry_test(
    request: Request,
    mode: str = Query(
        "all",
        description="message | error | ai_span | all",
    ),
):
    """
    Fire tagged Sentry events for live demos. Safe to call — does not break app state.

    curl -X POST http://localhost:8000/api/debug/sentry-test \\
      -H "X-User-ID: demo-judge-user"
    """
    if not _demo_allowed():
        raise HTTPException(403, "Sentry debug disabled in production")

    if not sentry_service.is_enabled():
        raise HTTPException(
            503,
            "Sentry not configured — set SENTRY_DSN in backend/.env and restart",
        )

    allowed_modes = {"message", "error", "ai_span", "all"}
    if mode not in allowed_modes:
        raise HTTPException(400, f"mode must be one of: {', '.join(sorted(allowed_modes))}")

    user_id = request.headers.get("X-User-ID") or "sentry-demo-user"
    sentry_service.set_user(user_id)

    sentry_service.add_breadcrumb(
        "demo",
        "Scaffold Sentry test triggered",
        data={"mode": mode, "user_id": user_id},
    )

    sent: list[str] = []

    if mode in ("message", "all"):
        sentry_sdk.capture_message(
            "Scaffold Sentry demo — hackathon test message",
            level="info",
        )
        sent.append("message")

    if mode in ("error", "all"):
        sentry_service.capture_exception(
            RuntimeError("Scaffold Sentry demo error (intentional — not a real failure)"),
            tags={"demo": "sentry_test", "pipeline": "demo"},
            context={
                "note": "Intentional test event for hackathon judges",
                "product": "Scaffold",
            },
        )
        sent.append("error")

    if mode in ("ai_span", "all"):
        with sentry_sdk.start_span(op="ai.run", name="sentry_demo_rubric_analysis") as span:
            span.set_data("ai.model_id", "claude-sonnet-4-6")
            span.set_data("ai.prompt_tokens.used", 128)
            span.set_data("ai.completion_tokens.used", 64)
            span.set_data("ai.total_tokens.used", 192)
        sent.append("ai_span")

    return {
        "ok": True,
        "sentry": True,
        "mode": mode,
        "sent": sent,
        "user_id": user_id,
        "hint": "Check Sentry Issues + Performance → AI Monitoring within ~30 seconds",
    }
