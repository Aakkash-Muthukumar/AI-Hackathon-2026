"""
Google OAuth (Web Server flow) + Drive API document fetching.

Install: pip install google-auth-oauthlib google-api-python-client
"""
import os
import json
import asyncio
import sentry_sdk
from typing import Optional

GOOGLE_AVAILABLE = False
try:
    from google_auth_oauthlib.flow import Flow          # type: ignore[import]
    from google.oauth2.credentials import Credentials   # type: ignore[import]
    from google.auth.transport.requests import Request   # type: ignore[import]
    from googleapiclient.discovery import build         # type: ignore[import]
    GOOGLE_AVAILABLE = True
except ImportError:
    pass

_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback"
)


def _client_config() -> dict:
    return {
        "web": {
            "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
            "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
            "redirect_uris": [_REDIRECT_URI],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }


def _require_google():
    if not GOOGLE_AVAILABLE:
        raise RuntimeError(
            "Google auth packages not installed. "
            "Run: pip install google-auth-oauthlib google-api-python-client"
        )


def get_auth_url(state: str) -> str:
    _require_google()
    flow = Flow.from_client_config(_client_config(), scopes=_SCOPES)
    flow.redirect_uri = _REDIRECT_URI
    url, _ = flow.authorization_url(
        access_type="offline",
        state=state,
        prompt="consent",          # always request refresh token
        include_granted_scopes="true",
    )
    return url


def exchange_code(code: str) -> dict:
    """Exchange authorization code for tokens. Returns serializable dict for Redis."""
    _require_google()
    flow = Flow.from_client_config(_client_config(), scopes=_SCOPES)
    flow.redirect_uri = _REDIRECT_URI
    flow.fetch_token(code=code)
    return _creds_to_dict(flow.credentials)


def _creds_to_dict(creds: "Credentials") -> dict:
    from datetime import timezone
    expiry_iso = None
    if creds.expiry:
        try:
            expiry_iso = creds.expiry.replace(tzinfo=timezone.utc).isoformat()
        except Exception:
            expiry_iso = creds.expiry.isoformat()
    return {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes or _SCOPES),
        "expiry": expiry_iso,
    }


def _dict_to_creds(data: dict) -> "Credentials":
    from datetime import datetime, timezone
    expiry = None
    if data.get("expiry"):
        raw = data["expiry"]
        expiry = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
    return Credentials(
        token=data.get("token"),
        refresh_token=data.get("refresh_token"),
        token_uri=data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=data.get("client_id"),
        client_secret=data.get("client_secret"),
        scopes=data.get("scopes", _SCOPES),
        expiry=expiry,
    )


def _fetch_sync(doc_id: str, token_data: dict) -> tuple[str, dict]:
    """
    Synchronous: fetch document plain text via Drive export.
    Returns (text, updated_token_data) — updated_data reflects any token refresh.
    """
    creds = _dict_to_creds(token_data)

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())

    service = build("drive", "v3", credentials=creds, cache_discovery=False)
    content = service.files().export(fileId=doc_id, mimeType="text/plain").execute()

    text: str
    if isinstance(content, bytes):
        text = content.decode("utf-8")
    else:
        text = str(content)

    return text, _creds_to_dict(creds)


async def fetch_document_text(doc_id: str, token_data: dict) -> tuple[str, dict]:
    """
    Async wrapper around _fetch_sync.
    Returns (document_plain_text, updated_token_data).
    Callers should persist updated_token_data back to Redis so refreshed
    access tokens are not lost.
    """
    _require_google()
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(None, _fetch_sync, doc_id, token_data)
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise
