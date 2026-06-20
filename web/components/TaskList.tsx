import { Task } from "@/lib/types";
import { ProgressBar } from "./ProgressBar";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import clsx from "clsx";

interface Props {
  tasks: Task[];
  compact?: boolean;
}

export function TaskList({ tasks, compact = false }: Props) {
  if (!tasks.length) {
    return (
      <p className="text-sm text-gray-400 italic">
        No tasks yet — analyzing rubric…
      </p>
    );
  }

  const missingAll = tasks.flatMap((t) => t.missing_requirements);

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div key={task.id} className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {task.completion === 100 ? (
                <CheckCircle2 size={14} className="text-green-500 shrink-0" />
              ) : (
                <div
                  className={clsx(
                    "w-3.5 h-3.5 rounded-full border-2 shrink-0",
                    task.completion > 0 ? "border-scaffold-500" : "border-gray-300"
                  )}
                />
              )}
              <span className={clsx("text-sm", compact ? "" : "font-medium")}>
                {task.title}
              </span>
            </div>
            <span className="text-xs font-mono text-gray-500 shrink-0 ml-2">
              {task.completion.toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={task.completion} size="sm" showLabel={false} />
        </div>
      ))}

      {!compact && missingAll.length > 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertCircle size={14} className="text-amber-600" />
            <span className="text-xs font-semibold text-amber-700">Missing</span>
          </div>
          <ul className="space-y-0.5">
            {missingAll.map((m, i) => (
              <li key={i} className="text-xs text-amber-800 flex gap-1.5">
                <span className="text-amber-400">–</span>
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
