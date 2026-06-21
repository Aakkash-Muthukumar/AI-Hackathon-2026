"""Unit tests for pure logic that needs no external services."""
import asyncio
from datetime import datetime
from types import SimpleNamespace
from services.claude_service import _strip_fences
from services.redis_service import content_changed_enough
from services.browserbase_service import normalize_assignment, _get_live_view_url
from models.schemas import AssignmentSource


class TestStripFences:
    def test_plain_json_untouched(self):
        assert _strip_fences('{"a": 1}') == '{"a": 1}'

    def test_strips_bare_fence(self):
        raw = "```\n{\"a\": 1}\n```"
        assert _strip_fences(raw) == '{"a": 1}'

    def test_strips_language_tagged_fence(self):
        raw = "```json\n[1, 2, 3]\n```"
        assert _strip_fences(raw) == "[1, 2, 3]"

    def test_handles_surrounding_whitespace(self):
        raw = "   ```json\n{}\n```   "
        assert _strip_fences(raw) == "{}"


class TestContentChangedEnough:
    def test_no_previous_snapshot_is_always_changed(self):
        assert content_changed_enough(None, "anything") is True

    def test_small_change_below_threshold(self):
        old = "a" * 100
        new = "a" * 150
        assert content_changed_enough(old, new) is False

    def test_change_at_threshold(self):
        old = "a" * 100
        new = "a" * 200
        assert content_changed_enough(old, new) is True

    def test_custom_threshold(self):
        assert content_changed_enough("ab", "abcde", threshold=2) is True
        assert content_changed_enough("ab", "abc", threshold=2) is False


class TestNormalizeAssignment:
    def test_maps_canvas_fields(self):
        raw = {
            "title": "Essay",
            "due_date": "2026-07-01",
            "description": "Write an essay",
            "rubric": [
                {"criterion": "Thesis", "points": 20, "description": "Clear thesis"},
            ],
        }
        result = normalize_assignment(raw, AssignmentSource.CANVAS)
        assert result["title"] == "Essay"
        assert result["deadline"] == "2026-07-01"
        assert result["source"] == AssignmentSource.CANVAS
        assert result["prompt"] == "Write an essay"
        assert result["rubric"][0]["criterion"] == "Thesis"
        assert result["rubric"][0]["points"] == 20

    def test_defaults_for_missing_fields(self):
        result = normalize_assignment({}, AssignmentSource.NOTION)
        assert result["title"] == "Untitled Assignment"
        assert result["prompt"] == ""
        assert result["rubric"] == []
        assert result["deadline"] is None

    def test_rubric_name_alias_and_instructions_alias(self):
        raw = {
            "title": "HW",
            "instructions": "Do the homework",
            "rubric": [{"name": "Accuracy", "description": "Correct answers"}],
        }
        result = normalize_assignment(raw, AssignmentSource.GOOGLE_CLASSROOM)
        assert result["prompt"] == "Do the homework"
        assert result["rubric"][0]["criterion"] == "Accuracy"
        assert result["rubric"][0]["points"] is None

    def test_parses_human_readable_deadline(self):
        result = normalize_assignment(
            {"title": "Essay", "due_date": "June 21, 2023"},
            AssignmentSource.NOTION,
        )
        assert result["deadline"] == datetime(2023, 6, 21)

    def test_blank_deadline_becomes_none(self):
        result = normalize_assignment(
            {"title": "Essay", "due_date": ""},
            AssignmentSource.NOTION,
        )
        assert result["deadline"] is None


class TestGetLiveViewUrl:
    def test_prefers_first_page_fullscreen_url(self):
        bb = SimpleNamespace(
            sessions=SimpleNamespace(
                debug=lambda session_id: SimpleNamespace(
                    debugger_fullscreen_url="https://debug.example/session",
                    pages=[
                        SimpleNamespace(
                            debugger_fullscreen_url="https://debug.example/page-0"
                        )
                    ],
                )
            )
        )
        url = asyncio.run(_get_live_view_url(bb, "sess-123"))
        assert url == "https://debug.example/page-0"

    def test_falls_back_to_session_fullscreen_url(self):
        bb = SimpleNamespace(
            sessions=SimpleNamespace(
                debug=lambda session_id: SimpleNamespace(
                    debugger_fullscreen_url="https://debug.example/session",
                    pages=[],
                )
            )
        )
        url = asyncio.run(_get_live_view_url(bb, "sess-123"))
        assert url == "https://debug.example/session"
