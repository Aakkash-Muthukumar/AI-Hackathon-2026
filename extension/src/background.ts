import * as Sentry from "@sentry/browser"

const _sentryDsn = process.env.PLASMO_PUBLIC_SENTRY_DSN?.trim() ?? ""
if (_sentryDsn && !_sentryDsn.includes("...")) {
  Sentry.init({
    dsn: _sentryDsn,
    environment: process.env.NODE_ENV,
  })
}

const API = process.env.PLASMO_PUBLIC_API_URL ?? "http://localhost:8000/api"

// Generate a stable user ID on first install and persist it in extension storage.
// This ties the extension to the user's saved Browserbase contexts on the backend.
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("scaffold_user_id")
  if (!stored.scaffold_user_id) {
    await chrome.storage.local.set({
      scaffold_user_id: crypto.randomUUID(),
    })
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
  if (msg.type === "LIST_ASSIGNMENTS") {
    getUserId().then((userId) =>
      fetch(`${API}/assignments/`, { headers: apiHeaders(userId) })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => {
          Sentry.captureException(err)
          sendResponse({ ok: false, error: String(err) })
        })
    )
    return true
  }

  if (msg.type === "GET_ASSIGNMENT") {
    getUserId().then((userId) =>
      fetch(`${API}/assignments/${msg.assignmentId}`, {
        headers: apiHeaders(userId),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => {
          Sentry.captureException(err)
          sendResponse({ ok: false, error: String(err) })
        })
    )
    return true
  }

  if (msg.type === "UPDATE_PROGRESS") {
    getUserId().then((userId) =>
      fetch(`${API}/assignments/${msg.assignmentId}/progress`, {
        method: "POST",
        headers: apiHeaders(userId),
        body: JSON.stringify({
          assignment_id: msg.assignmentId,
          document_content: msg.content,
        }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => {
          Sentry.captureException(err)
          sendResponse({ ok: false, error: String(err) })
        })
    )
    return true
  }

  if (msg.type === "GET_USER_ID") {
    getUserId().then((userId) => sendResponse({ ok: true, userId }))
    return true
  }
})

export {}
