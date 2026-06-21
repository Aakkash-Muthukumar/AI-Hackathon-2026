import * as Sentry from "@sentry/browser"

const _sentryDsn = process.env.PLASMO_PUBLIC_SENTRY_DSN?.trim() ?? ""
if (_sentryDsn && !_sentryDsn.includes("...")) {
  Sentry.init({
    dsn: _sentryDsn,
    environment: process.env.NODE_ENV,
  })
}

const API = process.env.PLASMO_PUBLIC_API_URL ?? "http://localhost:8000/api"
const BACKEND = API.replace(/\/api$/, "")

// Generate a stable user ID on first install, persisted in extension storage.
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("scaffold_user_id")
  if (!stored.scaffold_user_id) {
    await chrome.storage.local.set({ scaffold_user_id: crypto.randomUUID() })
  }
})

async function getUserId(): Promise<string> {
  const stored = await chrome.storage.local.get("scaffold_user_id")
  if (stored.scaffold_user_id) return stored.scaffold_user_id as string
  const id = crypto.randomUUID()
  await chrome.storage.local.set({ scaffold_user_id: id })
  return id
}

function apiHeaders(userId: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-User-ID": userId,
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // ── Assignment CRUD ─────────────────────────────────────────────────────────

  if (msg.type === "LIST_ASSIGNMENTS") {
    getUserId().then((userId) =>
      fetch(`${API}/assignments/`, { headers: apiHeaders(userId) })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => { Sentry.captureException(err); sendResponse({ ok: false, error: String(err) }) })
    )
    return true
  }

  if (msg.type === "GET_ASSIGNMENT") {
    getUserId().then((userId) =>
      fetch(`${API}/assignments/${msg.assignmentId}`, { headers: apiHeaders(userId) })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => { Sentry.captureException(err); sendResponse({ ok: false, error: String(err) }) })
    )
    return true
  }

  if (msg.type === "UPDATE_PROGRESS") {
    getUserId().then((userId) =>
      fetch(`${API}/assignments/${msg.assignmentId}/progress`, {
        method: "POST",
        headers: apiHeaders(userId),
        body: JSON.stringify({ assignment_id: msg.assignmentId, document_content: msg.content }),
      })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => { Sentry.captureException(err); sendResponse({ ok: false, error: String(err) }) })
    )
    return true
  }

  // ── Google Docs live evaluation ─────────────────────────────────────────────

  if (msg.type === "EVALUATE_DOC") {
    getUserId().then((userId) =>
      fetch(`${API}/evaluate/`, {
        method: "POST",
        headers: apiHeaders(userId),
        body: JSON.stringify({
          doc_id: msg.docId,
          assignment_id: msg.assignmentId,
          user_id: userId,
        }),
      })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => { Sentry.captureException(err); sendResponse({ ok: false, error: String(err) }) })
    )
    return true
  }

  // ── Google OAuth ────────────────────────────────────────────────────────────

  if (msg.type === "CHECK_GOOGLE_AUTH") {
    // Auth routes are at /auth/google/* (no /api prefix) — use BACKEND base
    getUserId().then((userId) =>
      fetch(`${BACKEND}/auth/google/status?user_id=${userId}`)
        .then((r) => r.json())
        .then((data) => sendResponse({ ok: true, authorized: data.authorized ?? false }))
        .catch(() => sendResponse({ ok: false, authorized: false }))
    )
    return true
  }

  if (msg.type === "GOOGLE_AUTH_URL") {
    getUserId().then((userId) => {
      const url = `${BACKEND}/auth/google/authorize?user_id=${encodeURIComponent(userId)}`
      sendResponse({ ok: true, url })
    })
    return true
  }

  if (msg.type === "DISCONNECT_GOOGLE") {
    getUserId().then((userId) =>
      fetch(`${BACKEND}/auth/google/disconnect?user_id=${userId}`, { method: "DELETE" })
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }))
    )
    return true
  }

  // ── Utility ─────────────────────────────────────────────────────────────────

  if (msg.type === "GET_USER_ID") {
    getUserId().then((userId) => sendResponse({ ok: true, userId }))
    return true
  }
})

export {}
