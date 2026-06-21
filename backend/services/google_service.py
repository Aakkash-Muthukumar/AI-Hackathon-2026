"""
Google OAuth (Web Server flow) + Drive API document fetching.

Install: pip install google-auth-oauthlib google-api-python-client
"""
import os
import json
import logging
import asyncio
import sentry_sdk
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


class DriveFileNotFoundError(Exception):
    """Drive returned 404/notFound — file doesn't exist or caller lacks access."""


GOOGLE_AVAILABLE = False
try:
    from google_auth_oauthlib.flow import Flow          # type: ignore[import]
    from google.oauth2.credentials import Credentials   # type: ignore[import]
    from google.auth.transport.requests import Request   # type: ignore[import]
    from googleapiclient.discovery import build         # type: ignore[import]
    GOOGLE_AVAILABLE = True
except ImportError:
    pass

_SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/documents.readonly",
]
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


def get_auth_url(state: str) -> tuple[str, str]:
    """Return (authorization_url, code_verifier) for PKCE — verifier must be stored until callback."""
    _require_google()
    flow = Flow.from_client_config(_client_config(), scopes=_SCOPES)
    flow.redirect_uri = _REDIRECT_URI
    url, _ = flow.authorization_url(
        access_type="offline",
        state=state,
        prompt="consent",          # always request refresh token
        include_granted_scopes="true",
    )
    return url, flow.code_verifier


def exchange_code(code: str, code_verifier: str) -> dict:
    """Exchange authorization code for tokens. Returns serializable dict for Redis."""
    _require_google()
    flow = Flow.from_client_config(_client_config(), scopes=_SCOPES)
    flow.redirect_uri = _REDIRECT_URI
    flow.code_verifier = code_verifier
    flow.fetch_token(code=code)
    return _creds_to_dict(flow.credentials)


def _creds_to_dict(creds: "Credentials") -> dict:
    expiry_iso = None
    if creds.expiry:
        # google-auth compares expiry to naive UTC — always store naive UTC
        exp = creds.expiry
        if exp.tzinfo is not None:
            exp = exp.astimezone(timezone.utc).replace(tzinfo=None)
        expiry_iso = exp.isoformat()
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
    expiry = None
    if data.get("expiry"):
        raw = data["expiry"]
        expiry = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        # google-auth expects naive UTC for creds.expired checks
        if expiry.tzinfo is not None:
            expiry = expiry.astimezone(timezone.utc).replace(tzinfo=None)
    return Credentials(
        token=data.get("token"),
        refresh_token=data.get("refresh_token"),
        token_uri=data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=data.get("client_id"),
        client_secret=data.get("client_secret"),
        scopes=data.get("scopes", _SCOPES),
        expiry=expiry,
    )


_GOOGLE_DOC_MIME = "application/vnd.google-apps.document"
_WORD_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _extract_docs_api_text(document: dict) -> str:
    """Pull plain text from a Google Docs API documents.get response."""
    parts: list[str] = []

    def walk_elements(elements: list) -> None:
        for elem in elements:
            if "textRun" in elem and elem["textRun"].get("content"):
                parts.append(elem["textRun"]["content"])
            elif "paragraph" in elem:
                walk_elements(elem["paragraph"].get("elements", []))
            elif "table" in elem:
                for row in elem["table"].get("tableRows", []):
                    for cell in row.get("tableCells", []):
                        walk_elements(cell.get("content", []))

    for element in document.get("body", {}).get("content", []):
        if "paragraph" in element:
            walk_elements(element["paragraph"].get("elements", []))
        elif "table" in element:
            walk_elements([element])

    return "".join(parts)


def _fetch_via_docs_api(creds: "Credentials", doc_id: str) -> str:
    service = build("docs", "v1", credentials=creds, cache_discovery=False)
    try:
        document = service.documents().get(documentId=doc_id).execute()
    except Exception as e:
        if getattr(getattr(e, "resp", None), "status", None) == 404:
            raise DriveFileNotFoundError(str(e)) from e
        raise
    return _extract_docs_api_text(document)


def _fetch_docx(creds: "Credentials", doc_id: str) -> str:
    """Download an uploaded .docx from Drive and extract plain text."""
    from io import BytesIO
    from docx import Document  # type: ignore[import]

    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    raw = drive.files().get_media(fileId=doc_id).execute()
    doc = Document(BytesIO(raw))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _prepare_creds(token_data: dict) -> "Credentials":
    creds = _dict_to_creds(token_data)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return creds


def _get_file_meta_sync(doc_id: str, token_data: dict) -> tuple[dict, dict]:
    """Return (metadata dict with mimeType/name/modifiedTime, updated token_data)."""
    creds = _prepare_creds(token_data)
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    try:
        meta = drive.files().get(
            fileId=doc_id, fields="mimeType,name,modifiedTime"
        ).execute()
    except Exception as e:
        if getattr(getattr(e, "resp", None), "status", None) == 404:
            logger.info(
                "Drive 404 for doc_id=%s — wrong account or doc not yet saved", doc_id
            )
            raise DriveFileNotFoundError(str(e)) from e
        raise
    return meta, _creds_to_dict(creds)


async def get_file_metadata(doc_id: str, token_data: dict) -> tuple[dict, dict]:
    _require_google()
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _get_file_meta_sync, doc_id, token_data)


def _fetch_sync(doc_id: str, token_data: dict, meta: Optional[dict] = None) -> tuple[str, dict]:
    """
    Fetch document plain text. Uses Docs API for native Google Docs,
    Drive export as fallback.
    """
    creds = _prepare_creds(token_data)
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)

    if meta is None:
        meta = drive.files().get(fileId=doc_id, fields="mimeType,name").execute()

    mime = meta.get("mimeType", "")
    name = meta.get("name", "document")

    errors: list[str] = []

    if mime == _GOOGLE_DOC_MIME:
        try:
            text = _fetch_via_docs_api(creds, doc_id)
            return text, _creds_to_dict(creds)
        except DriveFileNotFoundError:
            raise
        except Exception as e:
            errors.append(f"Docs API: {e}")

        try:
            content = drive.files().export(fileId=doc_id, mimeType="text/plain").execute()
            text = content.decode("utf-8") if isinstance(content, bytes) else str(content)
            return text, _creds_to_dict(creds)
        except Exception as e:
            if getattr(getattr(e, "resp", None), "status", None) == 404:
                raise DriveFileNotFoundError(str(e)) from e
            errors.append(f"Drive export: {e}")

        raise RuntimeError(
            f"Could not read Google Doc '{name}'. "
            + " ".join(errors)
            + " Enable Google Docs API in Cloud Console and reconnect Google in the sidebar."
        )

    if mime == _WORD_DOCX_MIME:
        text = _fetch_docx(creds, doc_id)
        return text, _creds_to_dict(creds)

    raise RuntimeError(
        f"'{name}' is not a native Google Doc (type: {mime}). "
        "Scaffold can only track native Google Docs — create one at docs.google.com → Blank document, "
        "or paste your draft in the dashboard instead."
    )


async def fetch_document_text(
    doc_id: str, token_data: dict, meta: Optional[dict] = None
) -> tuple[str, dict]:
    """
    Async wrapper around _fetch_sync.
    Returns (document_plain_text, updated_token_data).
    Callers should persist updated_token_data back to Redis so refreshed
    access tokens are not lost.
    """
    _require_google()
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(None, _fetch_sync, doc_id, token_data, meta)
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise
