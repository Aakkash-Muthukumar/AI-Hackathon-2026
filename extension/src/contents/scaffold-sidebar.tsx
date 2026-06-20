/**
 * Plasmo content script — injects the Scaffold sidebar into:
 *   - Google Docs (docs.google.com)
 *   - Notion (notion.so)
 */
import type { PlasmoCSConfig } from "plasmo"
import { createRoot } from "react-dom/client"
import { Sidebar } from "../components/Sidebar"

export const config: PlasmoCSConfig = {
  matches: [
    "https://docs.google.com/document/*",
    "https://www.notion.so/*",
    "https://notion.so/*",
  ],
  run_at: "document_idle",
}

// ── Document content extractors per host ─────────────────────────────────────

function getGoogleDocsContent(): string {
  try {
    const iframe = document.querySelector<HTMLIFrameElement>(
      ".docs-editor-container iframe"
    )
    const doc = iframe?.contentDocument ?? document
    return Array.from(doc.querySelectorAll(".kix-paragraphrenderer"))
      .map((el) => (el as HTMLElement).innerText)
      .join("\n")
  } catch {
    return ""
  }
}

function getNotionContent(): string {
  return Array.from(document.querySelectorAll('[contenteditable="true"]'))
    .map((el) => (el as HTMLElement).innerText)
    .join("\n")
}

function getDocumentContent(): string {
  const host = location.hostname
  if (host.includes("google.com")) return getGoogleDocsContent()
  if (host.includes("notion.so")) return getNotionContent()
  return ""
}

// ── Mount into a shadow DOM so extension styles are isolated ─────────────────

const host = document.createElement("div")
host.id = "scaffold-sidebar-host"
Object.assign(host.style, {
  position: "fixed",
  top: "0",
  right: "0",
  zIndex: "2147483647",
  pointerEvents: "none",
})
document.body.appendChild(host)
document.body.style.marginRight = "280px"
document.body.style.transition = "margin-right 0.2s ease"

const shadow = host.attachShadow({ mode: "open" })
const mountPoint = document.createElement("div")
mountPoint.style.pointerEvents = "auto"
shadow.appendChild(mountPoint)

createRoot(mountPoint).render(<Sidebar getDocumentContent={getDocumentContent} />)

export {}
