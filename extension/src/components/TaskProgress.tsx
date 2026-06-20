import type { Task } from "./Sidebar"
import clsx from "clsx"

interface Props {
  tasks: Task[]
}

export function TaskProgress({ tasks }: Props) {
  if (!tasks.length) {
    return <p className="text-xs text-gray-400 italic">Analyzing…</p>
  }

  const missingAll = tasks.flatMap((t) => t.missing_requirements)

  return (
    <div className="space-y-2">
      {tasks.map((t) => {
        const pct = Math.min(100, Math.max(0, t.completion))
        const color =
          pct === 100 ? "#22c55e" : pct >= 60 ? "#4f6ef7" : pct >= 30 ? "#facc15" : "#f87171"
        return (
          <div key={t.id}>
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-xs text-gray-700 truncate max-w-[140px]">{t.title}</span>
              <span
                className="text-xs font-mono shrink-0 ml-1"
                style={{ color }}
              >
                {pct.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        )
      })}

      {missingAll.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2">
          <p className="text-xs font-semibold text-amber-700 mb-1">Missing</p>
          {missingAll.slice(0, 4).map((m, i) => (
            <p key={i} className="text-xs text-amber-800">– {m}</p>
          ))}
          {missingAll.length > 4 && (
            <p className="text-xs text-amber-500">+{missingAll.length - 4} more</p>
          )}
        </div>
      )}
    </div>
  )
}
