import { useEffect, useState } from "react"
import { BookOpen, ExternalLink, RefreshCw } from "lucide-react"

const DASHBOARD_URL = process.env.PLASMO_PUBLIC_DASHBOARD_URL ?? "http://localhost:3000"

interface Assignment {
  id: string
  title: string
  overall_completion: number
  deadline?: string
}

function App() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    chrome.runtime.sendMessage({ type: "LIST_ASSIGNMENTS" }, (res) => {
      setLoading(false)
      if (res?.ok) setAssignments(res.data.slice(0, 5))
    })
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ width: 320, fontFamily: "-apple-system, sans-serif", fontSize: 13 }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", background: "#4f6ef7", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff", fontWeight: 700 }}>
          <BookOpen size={18} />
          Scaffold
        </div>
        <button
          onClick={load}
          style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Assignment list */}
      <div style={{ padding: "12px 16px" }}>
        {loading ? (
          <p style={{ color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>Loading…</p>
        ) : assignments.length === 0 ? (
          <p style={{ color: "#9ca3af", textAlign: "center", padding: "20px 0", fontSize: 12 }}>
            No assignments yet.<br />Add one in the dashboard.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {assignments.map((a) => {
              const pct = Math.min(100, a.overall_completion)
              const color = pct === 100 ? "#22c55e" : pct >= 60 ? "#4f6ef7" : pct >= 30 ? "#facc15" : "#f87171"
              return (
                <div key={a.id} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: "#111827", fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.title}
                    </span>
                    <span style={{ fontWeight: 700, color, fontSize: 12 }}>{pct.toFixed(0)}%</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 99, background: "#e5e7eb", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 99, background: color, width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "10px 16px", borderTop: "1px solid #e5e7eb" }}>
        <a
          href={DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 6, color: "#4f6ef7", fontSize: 12, textDecoration: "none", fontWeight: 500 }}
        >
          <ExternalLink size={13} />
          Open full dashboard
        </a>
      </div>
    </div>
  )
}

export default App
