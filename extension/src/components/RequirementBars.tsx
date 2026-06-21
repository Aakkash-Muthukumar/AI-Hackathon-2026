import { reqColorAt } from "../lib/reqColors"

interface ReqScore {
  name?: string
  score: number
  missing: string[]
}

interface Props {
  requirements: Record<string, ReqScore>
  overall: number
}

export function RequirementBars({ requirements, overall }: Props) {
  const entries = Object.entries(requirements)

  if (!entries.length) {
    return <p className="text-xs text-gray-400 italic">Waiting for first evaluation…</p>
  }

  const totalScore = entries.reduce((s, [, r]) => s + Math.max(0, r.score), 0)

  return (
    <div className="space-y-3">
      {/* Overall — stacked segments match collapsed bottom bar */}
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
          <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
            {overall.toFixed(0)}%
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 99, background: "#e5e7eb", overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.min(100, Math.max(0, overall))}%`,
              height: "100%",
              display: "flex",
              transition: "width 0.5s ease",
            }}
          >
            {entries.map(([id, req], i) => {
              const share =
                totalScore > 0
                  ? (Math.max(0, req.score) / totalScore) * 100
                  : 100 / entries.length
              return (
                <div
                  key={id}
                  style={{
                    width: `${share}%`,
                    height: "100%",
                    background: reqColorAt(i),
                  }}
                />
              )
            })}
          </div>
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
          {entries.map(([id, req], i) => {
            const pct = Math.min(100, Math.max(0, req.score))
            const color = reqColorAt(i)
            const label = req.name ?? id
            return (
              <div key={id}>
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
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                    {label}
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
                {req.missing.length > 0 && (
                  <ul
                    style={{
                      marginTop: 5,
                      paddingLeft: 12,
                      listStyleType: "disc",
                    }}
                  >
                    {req.missing.slice(0, 4).map((m, i) => (
                      <li
                        key={i}
                        style={{ fontSize: 10, color: "#92400e", lineHeight: 1.6 }}
                      >
                        {m}
                      </li>
                    ))}
                    {req.missing.length > 4 && (
                      <li style={{ fontSize: 10, color: "#9ca3af", listStyleType: "none" }}>
                        +{req.missing.length - 4} more
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
