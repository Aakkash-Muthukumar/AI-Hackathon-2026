interface Props {
  width?: number
  label?: string
  className?: string
  /** light = dark ink on white; dark = light ink (e.g. blue header) */
  theme?: "light" | "dark"
}

export function ScaffoldLoader({
  width = 56,
  label,
  className,
  theme = "light",
}: Props) {
  const ink = theme === "dark" ? "#f1f5f9" : "#1e293b"
  const track = theme === "dark" ? "rgba(241,245,249,0.20)" : "rgba(30,41,59,0.16)"

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${className ?? ""}`}
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
    >
      <svg
        className="scaffold-loader"
        width={width}
        viewBox="0 0 96 110"
        role="img"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>{label ?? "Loading"}</title>
        <rect style={{ fill: ink }} x="6" y="4" width="8" height="102" rx="4" />
        <rect style={{ fill: ink }} x="82" y="4" width="8" height="102" rx="4" />
        <rect style={{ fill: ink }} x="2" y="103" width="16" height="6" rx="3" />
        <rect style={{ fill: ink }} x="78" y="103" width="16" height="6" rx="3" />
        <rect style={{ fill: track }} x="16" y="16" width="64" height="12" rx="4" />
        <rect className="scaffold-fill f1" style={{ fill: ink }} x="16" y="16" width="64" height="12" rx="4" />
        <rect style={{ fill: track }} x="16" y="38" width="64" height="12" rx="4" />
        <rect className="scaffold-fill f2" style={{ fill: ink }} x="16" y="38" width="64" height="12" rx="4" />
        <rect style={{ fill: track }} x="16" y="60" width="64" height="12" rx="4" />
        <rect className="scaffold-fill f3" style={{ fill: ink }} x="16" y="60" width="64" height="12" rx="4" />
        <rect style={{ fill: track }} x="16" y="82" width="64" height="12" rx="4" />
        <rect className="scaffold-fill f4" style={{ fill: ink }} x="16" y="82" width="64" height="12" rx="4" />
      </svg>
      {label && (
        <span className="text-sm text-slate-500 tracking-wide">{label}</span>
      )}
    </div>
  )
}
