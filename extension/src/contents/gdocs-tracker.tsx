/**
 * Plasmo content script — Google Docs live requirement tracker.
 *
 * Detects writing activity via keydown events on the hidden input iframe
 * (.docs-texteventtarget-iframe), then calls the backend to fetch the
 * document and score requirement coverage with Claude.
 *
 * Trigger constants (tune these):
 *   Y        800   eval fires immediately at this activity count (mid-typing)
 *   X        200   eval fires after a 2 s pause with this much activity
 *   X_MIN    50    minimum activity to trigger on a new paragraph
 *   PAUSE_MS 2000  quiet period before checking X
 */
import type { PlasmoCSConfig } from "plasmo"
import { useState, useEffect, useCallback, useRef } from "react"
import { createRoot } from "react-dom/client"
import { RequirementBars } from "../components/RequirementBars"
import { BookOpen, RefreshCw, ChevronLeft, ChevronRight, Link2, LogOut } from "lucide-react"

export const config: PlasmoCSConfig = {
  matches: ["https://docs.google.com/document/*"],
  run_at: "document_idle",
}

// ── Trigger constants ─────────────────────────────────────────────────────────

const Y = 800
const X = 200
const X_MIN = 50
const PAUSE_MS = 2_000

// ── Trigger state (module-level, outside React) ───────────────────────────────

let _activitySinceEval = 0
let _pauseTimer: ReturnType<typeof setTimeout> | null = null
let _newParagraph = false
let _onEvalNeeded: (() => void) | null = null

function _registerEvalCallback(cb: () => void) {
  _onEvalNeeded = cb
}

function _fireEval() {
  _onEvalNeeded?.()
}

function _clearPause() {
  if (_pauseTimer !== null) {
    clearTimeout(_pauseTimer)
    _pauseTimer = null
  }
}

function _onPause() {
  if (_activitySinceEval >= X) _fireEval()
}

function _onKeydown(e: KeyboardEvent) {
  _activitySinceEval += 1
  if (e.key === "Enter") _newParagraph = true

  if (_activitySinceEval >= Y) {
    _clearPause()
    _fireEval()
    return
  }
  if (_newParagraph && _activitySinceEval >= X_MIN) {
    _clearPause()
    _fireEval()
    return
  }
  _clearPause()
  _pauseTimer = setTimeout(_onPause, PAUSE_MS)
}

function _onPaste() {
  _clearPause()
  _fireEval()
}

function _attachToIframe(iframe: HTMLIFrameElement): boolean {
  const doc = iframe.contentDocument
  if (!doc) return false
  doc.addEventListener("keydown", _onKeydown)
  doc.addEventListener("paste", _onPaste)
  return true
}

// Wait for .docs-texteventtarget-iframe, then attach once it appears.
function _initTrigger() {
  const existing = document.querySelector<HTMLIFrameElement>(".docs-texteventtarget-iframe")
  if (existing && _attachToIframe(existing)) return

  const obs = new MutationObserver(() => {
    const iframe = document.querySelector<HTMLIFrameElement>(".docs-texteventtarget-iframe")
    if (iframe && _attachToIframe(iframe)) obs.disconnect()
  })
  obs.observe(document.body, { childList: true, subtree: true })
}

_initTrigger()

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDocId(): string {
  const m = location.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : ""
}

interface Assignment {
  id: string
  title: string
}

interface EvalResult {
  requirements: Record<string, { score: number; missing: string[] }>
  overall: number
  assignment_id: string
}

// ── React component ───────────────────────────────────────────────────────────

function GDocsTrackerSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scores, setScores] = useState<EvalResult | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authPolling, setAuthPolling] = useState(false)

  const evalInProgress = useRef(false)
  const evalSequence = useRef(0)
  const docId = getDocId()

  // ── Initial auth check ──────────────────────────────────────────────────────

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "CHECK_GOOGLE_AUTH" }, (res) => {
      setAuthorized(res?.authorized ?? false)
    })
    chrome.runtime.sendMessage({ type: "LIST_ASSIGNMENTS" }, (res) => {
      if (res?.ok && res.data?.length) {
        setAssignments(res.data)
        setSelectedId(res.data[0].id)
      }
    })
  }, [])

  // ── Eval function ───────────────────────────────────────────────────────────

  const runEval = useCallback(() => {
    if (evalInProgress.current) return
    if (!selectedId || !docId || !authorized) return

    evalInProgress.current = true
    const seq = ++evalSequence.current
    _activitySinceEval = 0
    _newParagraph = false

    setEvaluating(true)
    setError(null)

    chrome.runtime.sendMessage(
      { type: "EVALUATE_DOC", docId, assignmentId: selectedId },
      (res) => {
        evalInProgress.current = false
        setEvaluating(false)

        if (seq !== evalSequence.current) return // stale — discard

        if (res?.ok) {
          setScores(res.data)
        } else {
          const msg = res?.error ?? "Evaluation failed"
          if (msg.includes("401") || msg.includes("not connected")) {
            setAuthorized(false)
          }
          setError(msg)
        }
      }
    )
  }, [selectedId, docId, authorized])

  // Register the trigger callback whenever runEval changes
  useEffect(() => {
    _registerEvalCallback(runEval)
    // Run immediately on mount / assignment change
    runEval()
  }, [runEval])

  // ── Google auth flow ────────────────────────────────────────────────────────

  function openAuthTab() {
    chrome.runtime.sendMessage({ type: "GOOGLE_AUTH_URL" }, (res) => {
      if (res?.url) {
        chrome.tabs.create({ url: res.url })
        setAuthPolling(true)
        pollAuthStatus()
      }
    })
  }

  function pollAuthStatus(attempts = 0) {
    if (attempts > 30) { setAuthPolling(false); return }
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: "CHECK_GOOGLE_AUTH" }, (res) => {
        if (res?.authorized) {
          setAuthorized(true)
          setAuthPolling(false)
        } else {
          pollAuthStatus(attempts + 1)
        }
      })
    }, 2_000)
  }

  function disconnectGoogle() {
    chrome.runtime.sendMessage({ type: "DISCONNECT_GOOGLE" }, () => {
      setAuthorized(false)
      setScores(null)
    })
  }

  // ── Collapsed pill ──────────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)",
          background: "#4f6ef7", color: "#fff", borderRadius: "8px 0 0 8px",
          padding: "10px 6px", border: "none", cursor: "pointer", zIndex: 999999,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          boxShadow: "-2px 0 8px rgba(0,0,0,0.15)",
        }}
      >
        <BookOpen size={16} />
        <ChevronLeft size={12} />
      </button>
    )
  }

  // ── Main sidebar ────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed", right: 0, top: 0, height: "100vh", width: 300,
        background: "#fff", borderLeft: "1px solid #e5e7eb",
        boxShadow: "-4px 0 16px rgba(0,0,0,0.08)",
        display: "flex", flexDirection: "column", zIndex: 999999,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div style={{
        padding: "12px 14px", borderBottom: "1px solid #e5e7eb",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#4f6ef7",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#fff", fontWeight: 600 }}>
          <BookOpen size={16} />
          Scaffold
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {authorized && (
            <button
              onClick={runEval}
              disabled={evaluating}
              title="Evaluate now"
              style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 2 }}
            >
              <RefreshCw size={14} style={{ animation: evaluating ? "spin 1s linear infinite" : "none" }} />
            </button>
          )}
          <button
            onClick={() => setCollapsed(true)}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 2 }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Assignment selector */}
      {authorized && assignments.length > 1 && (
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{
            margin: "10px 12px 0", padding: "6px 8px", borderRadius: 8,
            border: "1px solid #e5e7eb", fontSize: 12, color: "#374151",
          }}
        >
          {assignments.map((a) => (
            <option key={a.id} value={a.id}>{a.title}</option>
          ))}
        </select>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
        {authorized === null && (
          <p style={{ color: "#9ca3af", fontSize: 12, textAlign: "center", marginTop: 40 }}>
            Checking…
          </p>
        )}

        {authorized === false && (
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <p style={{ color: "#374151", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
              Connect your Google account so Scaffold can read your document.
            </p>
            <button
              onClick={openAuthTab}
              disabled={authPolling}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "9px 16px", borderRadius: 8, border: "none",
                background: "#4f6ef7", color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: authPolling ? "wait" : "pointer",
              }}
            >
              <Link2 size={14} />
              {authPolling ? "Waiting for authorization…" : "Connect Google account"}
            </button>
          </div>
        )}

        {authorized && !selectedId && (
          <p style={{ color: "#9ca3af", fontSize: 12, textAlign: "center", marginTop: 40 }}>
            No assignments found.{" "}
            <a
              href="http://localhost:3000"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#4f6ef7" }}
            >
              Add one in the dashboard
            </a>
            , then refresh.
          </p>
        )}

        {authorized && selectedId && (
          <>
            {evaluating && !scores && (
              <p style={{ color: "#9ca3af", fontSize: 12, textAlign: "center", marginTop: 40 }}>
                Evaluating…
              </p>
            )}
            {error && (
              <p style={{ color: "#ef4444", fontSize: 11, marginBottom: 10 }}>{error}</p>
            )}
            {scores && (
              <RequirementBars
                requirements={scores.requirements}
                overall={scores.overall}
              />
            )}
          </>
        )}
      </div>

      {/* Footer — Google account status */}
      {authorized && (
        <div style={{
          padding: "8px 14px", borderTop: "1px solid #f3f4f6",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 10, color: "#9ca3af" }}>
            {evaluating ? "Evaluating…" : scores ? "Up to date" : "Waiting for activity"}
          </span>
          <button
            onClick={disconnectGoogle}
            title="Disconnect Google"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#d1d5db" }}
          >
            <LogOut size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Shadow DOM mount ──────────────────────────────────────────────────────────

const host = document.createElement("div")
host.id = "scaffold-gdocs-host"
Object.assign(host.style, {
  position: "fixed",
  top: "0",
  right: "0",
  zIndex: "2147483647",
  pointerEvents: "none",
})
document.body.appendChild(host)
document.body.style.marginRight = "300px"
document.body.style.transition = "margin-right 0.2s ease"

const shadow = host.attachShadow({ mode: "open" })
const mountPoint = document.createElement("div")
mountPoint.style.pointerEvents = "auto"
shadow.appendChild(mountPoint)

createRoot(mountPoint).render(<GDocsTrackerSidebar />)

export {}
