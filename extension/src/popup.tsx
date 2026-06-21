import { useEffect, useState } from "react"
import { BookOpen, ExternalLink, RefreshCw, Link2 } from "lucide-react"
import { PROGRESS_GRADIENT, PROGRESS_BLUE } from "./lib/reqColors"

const DASHBOARD_URL = process.env.PLASMO_PUBLIC_DASHBOARD_URL ?? "http://localhost:3000"

interface Assignment {
  id: string
  title: string
  overall_completion: number
  deadline?: string
  source?: string
}

const SOURCE_META: Record<string, { label: string; dot: string }> = {
  canvas: { label: "Canvas", dot: "#e65724" },
  notion: { label: "Notion", dot: "#1c1c1e" },
  google_classroom: { label: "Classroom", dot: "#4285f4" },
  trello: { label: "Trello", dot: "#0052cc" },
  jira: { label: "Jira", dot: "#0052cc" },
  asana: { label: "Asana", dot: "#f06a6a" },
  clickup: { label: "ClickUp", dot: "#7b68ee" },
  manual: { label: "Manual", dot: "#9ca3af" },
}

function SourceBadge({ source }: { source?: string }) {
  if (!source || source === "manual") return null
  const meta = SOURCE_META[source]
  if (!meta) return null
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        color: "#6b7280",
        marginTop: 4,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: meta.dot,
          flexShrink: 0,
        }}
      />
      {meta.label}
    </span>
  )
}

function App() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState("")

  // Load stable user ID from extension storage so links carry it to the web app
  useEffect(() => {
    chrome.storage.local.get("scaffold_user_id", ({ scaffold_user_id }) => {
      setUserId(scaffold_user_id ?? "")
    })
  }, [])

  function load() {
    setLoading(true)
    chrome.runtime.sendMessage({ type: "LIST_ASSIGNMENTS" }, (res) => {
      setLoading(false)
      if (res?.ok) setAssignments(res.data.slice(0, 6))
    })
  }

  useEffect(() => { load() }, [])

  // Append ?uid= so the web app adopts the extension's user ID on first visit
  const uidParam = userId ? `?uid=${encodeURIComponent(userId)}` : ""
  const dashboardUrl = `${DASHBOARD_URL}${uidParam}`
  const connectUrl = `${DASHBOARD_URL}/connect${uidParam}`

  return (
    <div style={{ width: 320, fontFamily: "-apple-system, sans-serif", fontSize: 13 }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px",
        background: "#4f6ef7",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff", fontWeight: 700 }}>
          <BookOpen size={18} />
          Scaffold
        </div>
        <button
          onClick={load}
          style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Assignment list */}
      <div style={{ padding: "12px 16px" }}>
        {loading ? (
          <p style={{ color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>Loading…</p>
        ) : assignments.length === 0 ? (
          <p style={{ color: "#9ca3af", textAlign: "center", padding: "20px 0", fontSize: 12, lineHeight: 1.6 }}>
            No assignments yet.<br />
            Connect a platform or add one in the dashboard.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {assignments.map((a) => {
              const pct = Math.min(100, a.overall_completion)
              return (
                <div
                  key={a.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#fafafa",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span
                      style={{
                        fontWeight: 600,
                        color: "#111827",
                        fontSize: 12,
                        maxWidth: 210,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.title}
                    </span>
                    <span style={{ fontWeight: 700, color: PROGRESS_BLUE, fontSize: 12, flexShrink: 0 }}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 99, background: "#e5e7eb", overflow: "hidden", marginBottom: 4 }}>
                    <div style={{ height: "100%", borderRadius: 99, background: PROGRESS_GRADIENT, width: `${pct}%` }} />
                  </div>
                  <SourceBadge source={a.source} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "10px 16px", borderTop: "1px solid #e5e7eb", display: "flex", flexDirection: "column", gap: 8 }}>
        <a
          href={connectUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 12px",
            borderRadius: 8,
            background: "#4f6ef7",
            color: "#fff",
            fontSize: 12,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          <Link2 size={13} />
          Connect Canvas / Notion / Classroom
        </a>
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "#6b7280",
            fontSize: 12,
            textDecoration: "none",
          }}
        >
          <ExternalLink size={13} />
          Open full dashboard
        </a>
      </div>
    </div>
  )
}

export default App
