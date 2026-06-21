import { useState, useEffect, useCallback, useRef } from "react"
import { TaskProgress } from "./TaskProgress"
import { PROGRESS_GRADIENT } from "../lib/reqColors"
import { BookOpen, RefreshCw, ChevronRight, ChevronLeft } from "lucide-react"

export interface Task {
  id: string
  title: string
  completion: number
  missing_requirements: string[]
  success_criteria: string[]
}

export interface Assignment {
  id: string
  title: string
  overall_completion: number
  tasks: Task[]
}

const EVAL_DEBOUNCE_MS = 10_000

interface Props {
  getDocumentContent: () => string
}

export function Sidebar({ getDocumentContent }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selected, setSelected] = useState<Assignment | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadAssignments = useCallback(() => {
    setLoading(true)
    setError(null)
    chrome.runtime.sendMessage({ type: "LIST_ASSIGNMENTS" }, (res) => {
      setLoading(false)
      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError.message ?? "Extension error")
        return
      }
      if (!res?.ok) {
        setError(res?.error ?? "Could not load assignments")
        return
      }
      setAssignments(res.data)
      if (res.data.length > 0) {
        setSelected((prev) =>
          prev && res.data.some((a: Assignment) => a.id === prev.id)
            ? res.data.find((a: Assignment) => a.id === prev.id)!
            : res.data[0]
        )
      } else {
        setSelected(null)
      }
    })
  }, [])

  useEffect(() => {
    loadAssignments()
  }, [loadAssignments])

  const scheduleEval = useCallback(() => {
    if (!selected) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const content = getDocumentContent()
      if (!content.trim()) return
      setEvaluating(true)
      chrome.runtime.sendMessage(
        { type: "UPDATE_PROGRESS", assignmentId: selected.id, content },
        (res) => {
          setEvaluating(false)
          if (res?.ok) setSelected(res.data)
        }
      )
    }, EVAL_DEBOUNCE_MS)
  }, [selected, getDocumentContent])

  useEffect(() => {
    const observer = new MutationObserver(scheduleEval)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [scheduleEval])

  function manualEval() {
    if (!selected) return
    const content = getDocumentContent()
    if (!content.trim()) return
    setEvaluating(true)
    chrome.runtime.sendMessage(
      { type: "UPDATE_PROGRESS", assignmentId: selected.id, content },
      (res) => {
        setEvaluating(false)
        if (res?.ok) setSelected(res.data)
      }
    )
  }

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

  return (
    <div
      style={{
        position: "fixed", right: 0, top: 0, height: "100vh", width: 280,
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
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={loadAssignments}
            disabled={loading}
            title="Reload assignments"
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 2 }}
          >
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 2 }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Assignment selector */}
      {assignments.length > 1 && (
        <select
          value={selected?.id ?? ""}
          onChange={(e) => {
            const a = assignments.find((x) => x.id === e.target.value)
            if (a) setSelected(a)
          }}
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
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {!selected ? (
          <p style={{ color: "#9ca3af", fontSize: 12, textAlign: "center", marginTop: 40 }}>
            {loading
              ? "Loading assignments…"
              : error
              ? error
              : <>No assignments yet.<br />Add one in the dashboard, then click refresh.</>}
          </p>
        ) : (
          <>
            {/* Overall */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Overall
                </span>
                <span style={{ fontWeight: 700, color: "#111827" }}>
                  {selected.overall_completion.toFixed(0)}%
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: "#e5e7eb", overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 99, background: PROGRESS_GRADIENT,
                  width: `${selected.overall_completion}%`, transition: "width 0.5s ease",
                }} />
              </div>
            </div>

            {/* Task breakdown */}
            <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Requirements
            </p>
            <TaskProgress tasks={selected.tasks} />
          </>
        )}
      </div>
    </div>
  )
}
