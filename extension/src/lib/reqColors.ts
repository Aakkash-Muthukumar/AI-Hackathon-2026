/** Stable per-requirement colors — same ID → same color in sidebar and bottom bar. */
export const REQ_COLORS = [
  "#4f6ef7", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
  "#14b8a6", "#84cc16",
]

export function reqColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h * 31) + id.charCodeAt(i)) >>> 0
  return REQ_COLORS[h % REQ_COLORS.length]
}
