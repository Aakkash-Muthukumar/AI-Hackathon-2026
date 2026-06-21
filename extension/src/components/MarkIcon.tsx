interface MarkProps {
  width?: number
  height?: number
}

/** Scaffold mark — white bars on blue header / launcher. */
export function MarkIcon({ width = 20, height = 23 }: MarkProps) {
  return (
    <svg className="sf-mark" viewBox="0 0 24 28" width={width} height={height} aria-hidden="true">
      <rect x="2" y="2" width="2.6" height="24" rx="1.3" fill="#fff" />
      <rect x="19.4" y="2" width="2.6" height="24" rx="1.3" fill="#fff" />
      <rect x="6" y="5" width="5" height="3.4" rx="1.5" fill="#fff" />
      <rect x="6" y="12.3" width="9" height="3.4" rx="1.5" fill="#fff" />
      <rect x="6" y="19.6" width="12" height="3.4" rx="1.5" fill="#fff" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v6h-6" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function LogOutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

export { RefreshIcon, CloseIcon, LogOutIcon, LinkIcon }
