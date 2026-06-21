import clsx from "clsx";

interface Props {
  value: number; // 0–100
  size?: "sm" | "md";
  showLabel?: boolean;
}

// Matches the extension's progress gradient (light blue → dark blue).
const PROGRESS_GRADIENT = "linear-gradient(90deg, #93c5fd 0%, #1e40af 100%)";

export function ProgressBar({ value, size = "md", showLabel = true }: Props) {
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div className="flex items-center gap-2">
      <div
        className={clsx(
          "flex-1 rounded-full bg-gray-200 overflow-hidden",
          size === "sm" ? "h-1.5" : "h-2.5"
        )}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: PROGRESS_GRADIENT }}
        />
      </div>
      {showLabel && (
        <span className="w-10 text-right text-sm font-medium tabular-nums text-scaffold-700">
          {pct.toFixed(0)}%
        </span>
      )}
    </div>
  );
}
