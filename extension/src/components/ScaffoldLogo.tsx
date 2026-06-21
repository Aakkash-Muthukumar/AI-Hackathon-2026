import { BRAND } from "../lib/brand"

interface Props {
  variant?: "full" | "mark"
  color?: string
  height?: number
}

function ScaffoldMark({ color }: { color: string }) {
  return (
    <g fill={color}>
      <rect x="6" y="4" width="8" height="102" rx="4" />
      <rect x="82" y="4" width="8" height="102" rx="4" />
      <rect x="2" y="103" width="16" height="6" rx="3" />
      <rect x="78" y="103" width="16" height="6" rx="3" />
      <rect x="16" y="16" width="64" height="12" rx="4" opacity="0.2" />
      <rect x="16" y="16" width="16" height="12" rx="4" />
      <rect x="16" y="38" width="64" height="12" rx="4" opacity="0.2" />
      <rect x="16" y="38" width="35" height="12" rx="4" />
      <rect x="16" y="60" width="64" height="12" rx="4" opacity="0.2" />
      <rect x="16" y="60" width="51" height="12" rx="4" />
      <rect x="16" y="82" width="64" height="12" rx="4" opacity="0.2" />
      <rect x="16" y="82" width="64" height="12" rx="4" />
    </g>
  )
}

export function ScaffoldLogo({ variant = "mark", color = "#ffffff", height = 20 }: Props) {
  if (variant === "full") {
    const w = (280 / 110) * height
    return (
      <svg viewBox="0 0 280 110" width={w} height={height} role="img" aria-label="Scaffold" xmlns="http://www.w3.org/2000/svg">
        <ScaffoldMark color={color} />
        <text x="108" y="72" fill={color} fontFamily="system-ui,sans-serif" fontSize="48" fontWeight="500" letterSpacing="-1.5">scaffold</text>
      </svg>
    )
  }
  const w = (96 / 110) * height
  return (
    <svg viewBox="0 0 96 110" width={w} height={height} role="img" aria-label="Scaffold" xmlns="http://www.w3.org/2000/svg">
      <ScaffoldMark color={color} />
    </svg>
  )
}

export { BRAND }
