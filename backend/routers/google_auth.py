import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from services import redis_service, google_service

router = APIRouter(prefix="/auth/google", tags=["auth"])


@router.get("/authorize")
async def authorize(user_id: str):
    """Redirect the browser to Google's OAuth consent screen."""
    if not google_service.GOOGLE_AVAILABLE:
        raise HTTPException(503, "Google auth packages not installed on this server")
    url = google_service.get_auth_url(state=user_id)
    return RedirectResponse(url)


@router.get("/callback")
async def callback(code: str, state: str, error: str = ""):
    """Receive the authorization code, exchange for tokens, store in Redis."""
    if error:
        raise HTTPException(400, f"Google OAuth error: {error}")
    if not google_service.GOOGLE_AVAILABLE:
        raise HTTPException(503, "Google auth packages not installed on this server")

    user_id = state
    try:
        token_data = google_service.exchange_code(code)
    except Exception as e:
        raise HTTPException(400, f"Token exchange failed: {e}")

    await redis_service.save_google_token(user_id, token_data)

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    return RedirectResponse(f"{frontend_url}?google_auth=success&user_id={user_id}")


@router.get("/status")
async def status(user_id: str):
    """Check whether the user has a stored Google token."""
    token_data = await redis_service.get_google_token(user_id)
    return {"authorized": token_data is not None}


@router.delete("/disconnect")
async def disconnect(user_id: str):
    """Remove the stored token, forcing re-auth on next use."""
    await redis_service.delete_google_token(user_id)
    return {"status": "disconnected"}
