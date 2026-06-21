/** Stable per-requirement colors — same ID → same color in sidebar and bottom bar.
 *  Light → dark blue ramp so every bar shares one cohesive blue scheme. */
export const REQ_COLORS = [
  "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6",
  "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a",
  "#172554", "#0c1430",
]

/** Fill for single-value progress bars — flows light blue → dark blue. */
export const PROGRESS_GRADIENT = "linear-gradient(90deg, #93c5fd 0%, #1e40af 100%)"

/** Solid dark blue for accompanying percentage text. */
export const PROGRESS_BLUE = "#1e40af"

export function reqColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h * 31) + id.charCodeAt(i)) >>> 0
  return REQ_COLORS[h % REQ_COLORS.length]
}

/** Color by position so stacked segments read lightest → darkest, left to right.
 *  Same index → same color in the sidebar and the Google Doc bottom bar. */
export function reqColorAt(index: number): string {
  return REQ_COLORS[index % REQ_COLORS.length]
}

/** Per-requirement gradient — flows from this index's ramp color to the next darker step.
 *  Matches the bottom bar segment at the same index. */
export function reqGradientAt(index: number): string {
  const i = index % REQ_COLORS.length
  const from = REQ_COLORS[i]
  const to = REQ_COLORS[Math.min(i + 1, REQ_COLORS.length - 1)]
  return `linear-gradient(90deg, ${from} 0%, ${to} 100%)`
}
