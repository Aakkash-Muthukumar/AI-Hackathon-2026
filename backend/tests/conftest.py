"""
Shared test fixtures and environment setup.

A dummy ANTHROPIC_API_KEY is set before any backend module is imported so that
`anthropic.Anthropic()` (constructed at import time in claude_service) does not
raise. No network calls are made during the test suite.
"""
import os

os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test-dummy")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")
