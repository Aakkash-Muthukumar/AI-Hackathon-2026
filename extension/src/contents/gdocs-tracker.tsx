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
import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react"
import { createRoot } from "react-dom/client"
import { ScaffoldLoader } from "../components/ScaffoldLoader"
import { MarkIcon, RefreshIcon, CloseIcon, LogOutIcon, LinkIcon } from "../components/MarkIcon"
import { reqColorAt, reqGradientAt, PROGRESS_GRADIENT, PROGRESS_BLUE } from "../lib/reqColors"
import { GDOCS_SIDEBAR_CSS } from "../styles/gdocs-sidebar.css"

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
  const path = location.pathname
  // Published/embedded docs use /d/e/… — not a Drive file id
  if (path.includes("/document/d/e/")) return ""
  const m = path.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : ""
}

function docAssignmentKey(docId: string): string {
  return `scaffold_doc_assignment:${docId}`
}

async function loadSavedAssignment(docId: string): Promise<string | null> {
  if (!docId) return null
  const stored = await chrome.storage.local.get(docAssignmentKey(docId))
  const saved = stored[docAssignmentKey(docId)]
  return typeof saved === "string" ? saved : null
}

async function saveAssignmentForDoc(docId: string, assignmentId: string): Promise<void> {
  if (!docId) return
  await chrome.storage.local.set({ [docAssignmentKey(docId)]: assignmentId })
}

interface Assignment {
  id: string
  title: string
}

interface EvalResult {
  requirements: Record<string, { name?: string; score: number; missing: string[] }>
  overall: number
  assignment_id: string
  unavailable_reason?: string
}

type BarEntry = [string, { name?: string; score: number; missing: string[] }]

function rowDelay(i: number): CSSProperties {
  return { transitionDelay: `${0.1 + i * 0.08}s` }
}

function CollapsedBottomBar({
  entries,
  overall,
  totalScore,
  onExpand,
}: {
  entries: BarEntry[]
  overall: number
  totalScore: number
  onExpand: () => void
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const expanded = hoveredIdx !== null

  return (
    <div
      className={`scaffold-bottom-bar${expanded ? " expanded" : ""}`}
      onClick={onExpand}
      title={`Overall: ${overall.toFixed(0)}% — click to expand`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onExpand()
        }
      }}
    >
      <div className="scaffold-bottom-inner">
        {entries.length === 0 || overall <= 0 ? (
          <div
            className="scaffold-bottom-fill"
            style={{ width: `${Math.min(100, overall)}%`, background: PROGRESS_GRADIENT }}
          />
        ) : (
          <div
            className="scaffold-bottom-fill"
            style={{ width: `${Math.min(100, Math.max(0, overall))}%` }}
          >
            {entries.map(([id, req], i) => {
              const share =
                totalScore > 0
                  ? (Math.max(0, req.score) / totalScore) * 100
                  : 100 / entries.length
              const label = req.name ?? id
              const isHovered = hoveredIdx === i
              return (
                <div
                  key={id}
                  className={`scaffold-bottom-seg${isHovered ? " hovered" : ""}`}
                  onMouseEnter={(e) => {
                    e.stopPropagation()
                    setHoveredIdx(i)
                  }}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: isHovered ? `calc(${share}% + 16px)` : `${share}%`,
                    background: reqColorAt(i),
                  }}
                >
                  {isHovered && (
                    <div className="scaffold-bottom-tip">
                      {label} · {req.score.toFixed(0)}%
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── React component ───────────────────────────────────────────────────────────

function GDocsTrackerSidebar() {
  const [open, setOpen] = useState(false)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scores, setScores] = useState<EvalResult | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authPolling, setAuthPolling] = useState(false)

  const evalInProgress = useRef(false)
  const pendingEval = useRef(false)
  const pendingForce = useRef(false)
  const evalSequence = useRef(0)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [docId, setDocId] = useState(getDocId)
  const [refreshSpin, setRefreshSpin] = useState(false)

  // Sidebar slides over the doc — no page margin shift

  // Detect navigation to a different Google Doc in the same tab
  useEffect(() => {
    const tick = () => {
      const id = getDocId()
      setDocId((prev) => (prev === id ? prev : id))
    }
    tick()
    const iv = setInterval(tick, 800)
    return () => clearInterval(iv)
  }, [])

  const restoreAssignmentForDoc = useCallback(
    async (id: string, list: Assignment[]) => {
      if (!id || list.length === 0) {
        setSelectedId(null)
        return
      }
      const saved = await loadSavedAssignment(id)
      if (saved && list.some((a) => a.id === saved)) {
        setSelectedId(saved)
      } else {
        setSelectedId(null)
        setScores(null)
      }
    },
    []
  )

  const loadAssignments = useCallback(
    (forDocId?: string) => {
      chrome.runtime.sendMessage({ type: "LIST_ASSIGNMENTS" }, (res) => {
        if (chrome.runtime.lastError) {
          setError(chrome.runtime.lastError.message ?? "Could not load assignments")
          return
        }
        if (!res?.ok) {
          setError(res?.error ?? "Could not load assignments")
          return
        }
        const list = (res.data ?? []) as Assignment[]
        setAssignments(list)
        if (list.length === 0) {
          setSelectedId(null)
          return
        }
        void restoreAssignmentForDoc(forDocId ?? docId, list)
      })
    },
    [docId, restoreAssignmentForDoc]
  )

  // When the doc changes, clear scores and restore this doc's saved assignment (if any)
  useEffect(() => {
    setScores(null)
    setError(null)
    if (assignments.length > 0) {
      void restoreAssignmentForDoc(docId, assignments)
    } else {
      setSelectedId(null)
    }
  }, [docId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Initial auth check ──────────────────────────────────────────────────────

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "CHECK_GOOGLE_AUTH" }, (res) => {
      setAuthorized(res?.authorized ?? false)
    })
    loadAssignments()
  }, [loadAssignments])

  // ── Eval function ───────────────────────────────────────────────────────────

  const runEval = useCallback((options?: { force?: boolean }) => {
    const force = options?.force ?? false

    if (evalInProgress.current) {
      pendingEval.current = true
      if (force) pendingForce.current = true
      return
    }
    if (!selectedId || !docId || !authorized) return

    evalInProgress.current = true
    const seq = ++evalSequence.current
    _activitySinceEval = 0
    _newParagraph = false

    setEvaluating(true)
    setError(null)

    chrome.runtime.sendMessage(
      { type: "EVALUATE_DOC", docId, assignmentId: selectedId, force },
      (res) => {
        evalInProgress.current = false
        setEvaluating(false)

        if (seq !== evalSequence.current) return

        if (res?.ok) {
          setScores({ ...res.data })
          setLastUpdatedAt(Date.now())
        } else {
          const msg = res?.error ?? "Evaluation failed"
          if (msg.includes("401") || msg.includes("not connected")) {
            setAuthorized(false)
          }
          setError(msg)
        }

        if (pendingEval.current) {
          const nextForce = pendingForce.current
          pendingEval.current = false
          pendingForce.current = false
          runEval({ force: nextForce })
        }
      }
    )
  }, [selectedId, docId, authorized])

  // Register keystroke trigger — only fires when an assignment is selected
  useEffect(() => {
    _registerEvalCallback(() => runEval())
  }, [runEval])

  // Evaluate when user picks an assignment (including restored per-doc choice)
  useEffect(() => {
    if (selectedId && docId && authorized) {
      runEval()
    }
  }, [selectedId, docId, authorized]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleAssignmentChange(id: string) {
    if (!id) return
    setSelectedId(id)
    setScores(null)
    setError(null)
    void saveAssignmentForDoc(docId, id)
  }

  // ── Google auth flow ────────────────────────────────────────────────────────

  function openAuthTab() {
    setError(null)
    chrome.runtime.sendMessage({ type: "GOOGLE_AUTH_URL" }, (res) => {
      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError.message ?? "Extension error")
        return
      }
      if (!res?.ok) {
        setError(res?.error ?? "Could not open Google sign-in")
        return
      }
      setAuthPolling(true)
      pollAuthStatus()
    })
  }

  function pollAuthStatus(attempts = 0) {
    if (attempts > 30) { setAuthPolling(false); return }
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: "CHECK_GOOGLE_AUTH" }, (res) => {
        if (res?.authorized) {
          setAuthorized(true)
          setAuthPolling(false)
          loadAssignments()
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

  function handleRefresh() {
    setRefreshSpin(true)
    window.setTimeout(() => setRefreshSpin(false), 600)
    loadAssignments(docId)
    runEval({ force: true })
  }

  const overall = scores?.overall ?? 0
  const reqEntries: BarEntry[] = scores ? Object.entries(scores.requirements) : []
  const totalScore = reqEntries.reduce((s, [, r]) => s + Math.max(0, r.score), 0)
  const showBottomBar = !open && authorized && selectedId && reqEntries.length > 0 && !scores?.unavailable_reason

  const footText = evaluating
    ? "Evaluating…"
    : lastUpdatedAt
    ? `Updated ${new Date(lastUpdatedAt).toLocaleTimeString()}`
    : scores
    ? "Up to date"
    : "Waiting for activity"

  return (
    <div className={`scaffold-root${open ? " scaffold-open" : ""}`}>
      <style>{GDOCS_SIDEBAR_CSS}</style>

      {/* Collapsed launcher tab */}
      <button
        type="button"
        className="scaffold-launcher"
        aria-label="Open Scaffold panel"
        onClick={() => setOpen(true)}
      >
        <MarkIcon />
        <span className="sf-word">scaffold</span>
        {overall > 0 && (
          <div className="sf-launch-cov" aria-hidden="true">
            <div
              className="sf-launch-cov-fill"
              style={{ width: `${Math.min(100, overall)}%`, background: PROGRESS_GRADIENT }}
            />
          </div>
        )}
      </button>

      {showBottomBar && (
        <CollapsedBottomBar
          entries={reqEntries}
          overall={overall}
          totalScore={totalScore}
          onExpand={() => setOpen(true)}
        />
      )}

      {/* Slide-in sidebar */}
      <aside className="scaffold-sidebar" aria-label="Scaffold">
        <div className="sf-head">
          <div className="sf-logo">
            <MarkIcon width={17} height={20} />
            scaffold
          </div>
          <div className="sf-actions">
            <button
              type="button"
              className="sf-iconbtn"
              aria-label="Re-evaluate"
              disabled={evaluating}
              onClick={handleRefresh}
            >
              {evaluating ? (
                <ScaffoldLoader width={18} theme="dark" />
              ) : (
                <span className={refreshSpin ? "sf-spin" : undefined} style={{ display: "flex" }}>
                  <RefreshIcon />
                </span>
              )}
            </button>
            <button
              type="button"
              className="sf-iconbtn"
              aria-label="Close panel"
              onClick={() => setOpen(false)}
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="sf-body">
          {authorized === null && (
            <div className="sf-center sf-row" style={rowDelay(0)}>
              <ScaffoldLoader width={52} label="Checking…" />
            </div>
          )}

          {authorized === false && (
            <div className="sf-row" style={rowDelay(0)}>
              <p className="sf-msg">
                Connect your Google account so Scaffold can read your document.
              </p>
              <div style={{ textAlign: "center" }}>
                <button
                  type="button"
                  className="sf-auth-btn"
                  onClick={openAuthTab}
                  disabled={authPolling}
                >
                  <LinkIcon />
                  {authPolling ? "Waiting for authorization…" : "Connect Google account"}
                </button>
              </div>
              {error && <p className="sf-err" style={{ textAlign: "center", marginTop: 12 }}>{error}</p>}
            </div>
          )}

          {authorized && assignments.length > 0 && (
            <div className="sf-sel-wrap sf-row" style={rowDelay(0)}>
              <select
                className="sf-sel"
                value={selectedId ?? ""}
                onChange={(e) => handleAssignmentChange(e.target.value)}
              >
                <option value="" disabled>Select assignment…</option>
                {assignments.map((a) => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>
          )}

          {authorized && assignments.length > 0 && !selectedId && (
            <p className="sf-msg sf-row" style={rowDelay(1)}>
              Select an assignment above to start tracking this document.
            </p>
          )}

          {authorized && assignments.length === 0 && (
            <p className="sf-msg sf-row" style={rowDelay(0)}>
              No assignments found.
              <br />
              <a href="http://localhost:3000" target="_blank" rel="noreferrer">
                Open the dashboard
              </a>{" "}
              once to sync your account, then click refresh above.
            </p>
          )}

          {authorized && selectedId && (
            <>
              {evaluating && !scores && (
                <div className="sf-center sf-row" style={rowDelay(1)}>
                  <ScaffoldLoader width={52} label="Evaluating…" />
                </div>
              )}

              {error && <p className="sf-err sf-row" style={rowDelay(1)}>{error}</p>}

              {scores?.unavailable_reason === "not_found" && (
                <div className="sf-warn sf-row" style={rowDelay(1)}>
                  <strong>Can&apos;t read this document.</strong>
                  <br />
                  Make sure it&apos;s open in the signed-in Google account and has been saved at least once.
                </div>
              )}

              {scores && !scores.unavailable_reason && reqEntries.length > 0 && (
                <>
                  <div className="sf-row" style={rowDelay(1)}>
                    <div className="sf-cov-top">
                      <span className="sf-lbl">Overall coverage</span>
                      <span className="sf-cov-pct" style={{ color: PROGRESS_BLUE }}>
                        {overall.toFixed(0)}%
                      </span>
                    </div>
                    <div className="sf-cov-bar">
                      <div
                        className="sf-cov-fill"
                        style={{ "--cov": `${Math.min(100, Math.max(0, overall))}%` } as CSSProperties}
                      >
                        {reqEntries.map(([id, req], i) => {
                          const share =
                            totalScore > 0
                              ? (Math.max(0, req.score) / totalScore) * 100
                              : 100 / reqEntries.length
                          return (
                            <div
                              key={id}
                              className="sf-cov-seg"
                              style={{ width: `${share}%`, background: reqColorAt(i) }}
                            />
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="sf-lbl sf-row" style={{ ...rowDelay(2), display: "block", margin: "0 0 12px" }}>
                    Requirements
                  </div>

                  {reqEntries.map(([id, req], i) => {
                    const pct = Math.min(100, Math.max(0, req.score))
                    const label = req.name ?? id
                    const color = reqColorAt(i)
                    return (
                      <div key={id} className="sf-req sf-row" style={rowDelay(3 + i)}>
                        <div className="sf-req-top">
                          <span className="sf-req-name">
                            <span className="sf-dot" style={{ background: color }} />
                            <span>{label}</span>
                          </span>
                          <span className="sf-req-pct" style={{ color }}>{pct.toFixed(0)}%</span>
                        </div>
                        <div className="sf-req-bar">
                          <div
                            className="sf-req-bf"
                            style={{ "--w": `${pct}%`, background: reqGradientAt(i) } as CSSProperties}
                          />
                        </div>
                        {req.missing.slice(0, 4).map((m, j) => (
                          <div key={j} className="sf-bul">{m}</div>
                        ))}
                      </div>
                    )
                  })}
                </>
              )}
            </>
          )}
        </div>

        {authorized && (
          <div className="sf-foot">
            <span>{footText}</span>
            <button
              type="button"
              className="sf-foot-btn"
              title="Disconnect Google"
              onClick={disconnectGoogle}
            >
              <LogOutIcon />
            </button>
          </div>
        )}
      </aside>
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
document.body.style.marginRight = "0"
document.body.style.transition = "margin-right 0.2s ease"

const shadow = host.attachShadow({ mode: "open" })
const mountPoint = document.createElement("div")
mountPoint.style.pointerEvents = "auto"
shadow.appendChild(mountPoint)

createRoot(mountPoint).render(<GDocsTrackerSidebar />)

export {}
