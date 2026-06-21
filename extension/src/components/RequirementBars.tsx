interface ReqScore {
  score: number
  missing: string[]
}

interface Props {
  requirements: Record<string, ReqScore>
  overall: number
}

function scoreColor(pct: number): string {
  if (pct === 100) return "#22c55e"
  if (pct >= 70) return "#4f6ef7"
  if (pct >= 40) return "#facc15"
  return "#f87171"
}

export function RequirementBars({ requirements, overall }: Props) {
  const entries = Object.entries(requirements)

  if (!entries.length) {
    return <p className="text-xs text-gray-400 italic">Waiting for first evaluation…</p>
  }

  const overallColor = scoreColor(overall)

  return (
    <div className="space-y-3">
      {/* Overall */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#6b7280",
            }}
          >
            Overall coverage
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: overallColor }}>
            {overall.toFixed(0)}%
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: "#e5e7eb", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              borderRadius: 99,
              background: overallColor,
              width: `${overall}%`,
              transition: "width 0.5s ease",
            }}
          />
        </div>
      </div>

      <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#6b7280",
            marginBottom: 10,
          }}
        >
          Requirements
        </p>

        <div className="space-y-3">
          {entries.map(([name, { score, missing }]) => {
            const pct = Math.min(100, Math.max(0, score))
            const color = scoreColor(pct)
            return (
              <div key={name}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "#374151",
                      maxWidth: 190,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {name}
                  </span>
                  <span
                    style={{ fontSize: 11, fontWeight: 700, color, marginLeft: 4, flexShrink: 0 }}
                  >
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div
                  style={{ height: 5, borderRadius: 99, background: "#e5e7eb", overflow: "hidden" }}
                >
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 99,
                      background: color,
                      width: `${pct}%`,
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
                {missing.length > 0 && (
                  <ul style={{ marginTop: 4, paddingLeft: 0, listStyle: "none" }}>
                    {missing.slice(0, 3).map((m, i) => (
                      <li
                        key={i}
                        style={{ fontSize: 10, color: "#92400e", lineHeight: 1.5 }}
                      >
                        ↳ {m}
                      </li>
                    ))}
                    {missing.length > 3 && (
                      <li style={{ fontSize: 10, color: "#9ca3af" }}>
                        +{missing.length - 3} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
