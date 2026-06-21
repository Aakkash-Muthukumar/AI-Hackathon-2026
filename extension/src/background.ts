import * as Sentry from "@sentry/browser"

const _sentryDsn = process.env.PLASMO_PUBLIC_SENTRY_DSN?.trim() ?? ""
if (_sentryDsn && !_sentryDsn.includes("...")) {
  Sentry.init({
    dsn: _sentryDsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 1.0,
  })
}

function syncSentryUser(userId: string) {
  if (!_sentryDsn || _sentryDsn.includes("...")) return
  Sentry.setUser({ id: userId })
}

function trackExtensionAction(action: string, data?: Record<string, string>) {
  if (!_sentryDsn || _sentryDsn.includes("...")) return
  Sentry.addBreadcrumb({ category: "extension", message: action, level: "info", data })
}

const API = process.env.PLASMO_PUBLIC_API_URL ?? "http://localhost:8000/api"
const BACKEND = API.replace(/\/api$/, "")
const DASHBOARD_URLS = [
  "http://localhost:3000/*",
  "http://127.0.0.1:3000/*",
]
const USER_ID_KEY = "scaffold_user_id"

// Generate a stable user ID on first install, persisted in extension storage.
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(USER_ID_KEY)
  if (!stored[USER_ID_KEY]) {
    await chrome.storage.local.set({ [USER_ID_KEY]: crypto.randomUUID() })
  }
})

async function getUserId(): Promise<string> {
  const stored = await chrome.storage.local.get(USER_ID_KEY)
  if (stored[USER_ID_KEY]) {
    syncSentryUser(stored[USER_ID_KEY] as string)
    return stored[USER_ID_KEY] as string
  }
  const id = crypto.randomUUID()
  await chrome.storage.local.set({ [USER_ID_KEY]: id })
  syncSentryUser(id)
  return id
}

async function setUserId(userId: string): Promise<void> {
  await chrome.storage.local.set({ [USER_ID_KEY]: userId })
}

/** Pull scaffold_user_id from an open dashboard tab (web localStorage). */
async function syncUserIdFromDashboard(): Promise<string | null> {
  const tabs = await chrome.tabs.query({ url: DASHBOARD_URLS })
  if (!tabs.length || tabs[0].id == null) return null

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (key: string) => localStorage.getItem(key),
      args: [USER_ID_KEY],
    })
    if (typeof result === "string" && result) {
      await setUserId(result)
      return result
    }
  } catch (err) {
    Sentry.captureException(err)
  }
  return null
}

function apiHeaders(userId: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-User-ID": userId,
  }
}

async function fetchAssignments(userId: string): Promise<unknown[]> {
  const res = await fetch(`${API}/assignments/`, { headers: apiHeaders(userId) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as unknown[]
  if (data.length > 0) return data

  // Web dashboard stores a different user id in localStorage — sync and retry once.
  const syncedId = await syncUserIdFromDashboard()
  if (!syncedId || syncedId === userId) return data

  const retry = await fetch(`${API}/assignments/`, { headers: apiHeaders(syncedId) })
  if (!retry.ok) throw new Error(`HTTP ${retry.status}`)
  return (await retry.json()) as unknown[]
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // ── Assignment CRUD ─────────────────────────────────────────────────────────

  if (msg.type === "SYNC_USER_ID") {
    if (typeof msg.userId === "string" && msg.userId) {
      setUserId(msg.userId)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }))
    } else {
      sendResponse({ ok: false, error: "Missing userId" })
    }
    return true
  }

  if (msg.type === "LIST_ASSIGNMENTS") {
    getUserId()
      .then((userId) => fetchAssignments(userId))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => {
        Sentry.captureException(err)
        sendResponse({ ok: false, error: String(err) })
      })
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
    getUserId().then((userId) => {
      trackExtensionAction("evaluate_doc", {
        assignment_id: msg.assignmentId,
        doc_id: msg.docId,
      })
      return fetch(`${API}/evaluate/`, {
        method: "POST",
        headers: apiHeaders(userId),
        body: JSON.stringify({
          doc_id: msg.docId,
          assignment_id: msg.assignmentId,
          user_id: userId,
          force: Boolean(msg.force),
        }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.text().catch(() => r.statusText)
            throw new Error(body || `HTTP ${r.status}`)
          }
          return r.json()
        })
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => { Sentry.captureException(err); sendResponse({ ok: false, error: String(err) }) })
    })
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
    getUserId().then(async (userId) => {
      const url = `${BACKEND}/auth/google/authorize?user_id=${encodeURIComponent(userId)}`
      try {
        await chrome.tabs.create({ url })
        sendResponse({ ok: true, url })
      } catch (err) {
        sendResponse({ ok: false, error: String(err) })
      }
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
