import clsx from "clsx";

interface Props {
  value: number; // 0–100
  size?: "sm" | "md";
  showLabel?: boolean;
}

export function ProgressBar({ value, size = "md", showLabel = true }: Props) {
  const pct = Math.min(100, Math.max(0, value));
  const color =
    pct === 100
      ? "bg-green-500"
      : pct >= 60
      ? "bg-scaffold-500"
      : pct >= 30
      ? "bg-yellow-400"
      : "bg-red-400";

  return (
    <div className="flex items-center gap-2">
      <div
        className={clsx(
          "flex-1 rounded-full bg-gray-200 overflow-hidden",
          size === "sm" ? "h-1.5" : "h-2.5"
        )}
      >
        <div
          className={clsx("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-10 text-right text-sm font-medium tabular-nums">
          {pct.toFixed(0)}%
        </span>
      )}
    </div>
  );
}
