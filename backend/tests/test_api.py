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
    assert res.json() == {"status": "ok", "service": "scaffold-api"}


def test_supported_platforms():
    res = client.get("/api/discovery/supported")
    assert res.status_code == 200
    platforms = res.json()["platforms"]
    by_id = {p["id"]: p for p in platforms}

    assert by_id["canvas"]["status"] == "supported"
    assert by_id["notion"]["status"] == "supported"
    assert by_id["google_classroom"]["status"] == "supported"
    assert by_id["jira"]["status"] == "coming_soon"


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
