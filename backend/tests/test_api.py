"""
API tests for routes that do not touch external services.

TestClient is constructed without the `with` context manager so the app
lifespan (which initializes Arize Phoenix) does not run.
"""
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "scaffold-api"
    assert "sentry" in body


def test_supported_platforms():
    res = client.get("/api/discovery/supported")
    assert res.status_code == 200
    platforms = res.json()["platforms"]
    by_id = {p["id"]: p for p in platforms}

    assert by_id["canvas"]["status"] == "supported"
    assert by_id["notion"]["status"] == "supported"
    assert by_id["google_classroom"]["status"] == "supported"
    assert by_id["trello"]["status"] == "supported"
    assert by_id["jira"]["status"] == "supported"
    assert by_id["asana"]["status"] == "supported"
    assert by_id["clickup"]["status"] == "supported"


def test_sync_starts_background_task(monkeypatch):
    import routers.discovery as discovery

    async def fake_sync(platform, credentials):
        return None

    monkeypatch.setattr(discovery, "_sync_platform", fake_sync)

    res = client.post(
        "/api/discovery/sync",
        json={"platform": "canvas", "credentials": {"username": "u", "password": "p"}},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "syncing"
    assert body["platform"] == "canvas"


def test_sentry_test_requires_sentry():
    res = client.post("/api/debug/sentry-test")
    assert res.status_code == 503


def test_sentry_test_ok_when_enabled(monkeypatch):
    import services.sentry_service as ss

    monkeypatch.setattr(ss, "is_enabled", lambda: True)
    monkeypatch.setattr(ss, "set_user", lambda _uid: None)
    monkeypatch.setattr(ss, "add_breadcrumb", lambda *a, **k: None)
    monkeypatch.setattr(ss, "capture_exception", lambda *a, **k: None)

    res = client.post(
        "/api/debug/sentry-test",
        headers={"X-User-ID": "judge-demo"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["user_id"] == "judge-demo"
    assert "message" in body["sent"]
    assert "error" in body["sent"]
    assert "ai_span" in body["sent"]
