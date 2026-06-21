const LOADER_STYLES = `
.scaffold-fill{
  transform-box:fill-box;
  transform-origin:left center;
  animation:scaffoldSweep 2s ease-in-out infinite;
}
.scaffold-fill.f4{animation-delay:0s}
.scaffold-fill.f3{animation-delay:.18s}
.scaffold-fill.f2{animation-delay:.36s}
.scaffold-fill.f1{animation-delay:.54s}
@keyframes scaffoldSweep{
  0%{transform:scaleX(0)}
  35%{transform:scaleX(1)}
  70%{transform:scaleX(1)}
  100%{transform:scaleX(0)}
}
@media (prefers-reduced-motion:reduce){
  .scaffold-fill{animation:scaffoldPulse 1.6s ease-in-out infinite}
  @keyframes scaffoldPulse{0%,100%{opacity:.35}50%{opacity:1}}
}
`

interface Props {
  width?: number
  label?: string
  theme?: "light" | "dark"
}

export function ScaffoldLoader({ width = 48, label, theme = "light" }: Props) {
  const ink = theme === "dark" ? "#f1f5f9" : "#1e293b"
  const track = theme === "dark" ? "rgba(241,245,249,0.20)" : "rgba(30,41,59,0.16)"

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }} role="status" aria-live="polite">
      <style>{LOADER_STYLES}</style>
      <svg className="scaffold-loader" width={width} viewBox="0 0 96 110" role="img" xmlns="http://www.w3.org/2000/svg">
        <title>{label ?? "Loading"}</title>
        <rect fill={ink} x="6" y="4" width="8" height="102" rx="4" />
        <rect fill={ink} x="82" y="4" width="8" height="102" rx="4" />
        <rect fill={ink} x="2" y="103" width="16" height="6" rx="3" />
        <rect fill={ink} x="78" y="103" width="16" height="6" rx="3" />
        <rect fill={track} x="16" y="16" width="64" height="12" rx="4" />
        <rect className="scaffold-fill f1" fill={ink} x="16" y="16" width="64" height="12" rx="4" />
        <rect fill={track} x="16" y="38" width="64" height="12" rx="4" />
        <rect className="scaffold-fill f2" fill={ink} x="16" y="38" width="64" height="12" rx="4" />
        <rect fill={track} x="16" y="60" width="64" height="12" rx="4" />
        <rect className="scaffold-fill f3" fill={ink} x="16" y="60" width="64" height="12" rx="4" />
        <rect fill={track} x="16" y="82" width="64" height="12" rx="4" />
        <rect className="scaffold-fill f4" fill={ink} x="16" y="82" width="64" height="12" rx="4" />
      </svg>
      {label && (
        <span style={{ fontSize: 12, color: "#64748b", letterSpacing: "0.2px" }}>{label}</span>
      )}
    </div>
  )
}
