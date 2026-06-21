import * as Sentry from "@sentry/browser"

const _sentryDsn = process.env.PLASMO_PUBLIC_SENTRY_DSN?.trim() ?? ""
if (_sentryDsn && !_sentryDsn.includes("...")) {
  Sentry.init({
    dsn: _sentryDsn,
    environment: process.env.NODE_ENV,
  })
}

const API = process.env.PLASMO_PUBLIC_API_URL ?? "http://localhost:8000/api"

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "LIST_ASSIGNMENTS") {
    fetch(`${API}/assignments/`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => {
        Sentry.captureException(err)
        sendResponse({ ok: false, error: String(err) })
      })
    return true
  }

  if (msg.type === "GET_ASSIGNMENT") {
    fetch(`${API}/assignments/${msg.assignmentId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => {
        Sentry.captureException(err)
        sendResponse({ ok: false, error: String(err) })
      })
    return true
  }

  if (msg.type === "UPDATE_PROGRESS") {
    fetch(`${API}/assignments/${msg.assignmentId}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    return true
  }
})

export {}
