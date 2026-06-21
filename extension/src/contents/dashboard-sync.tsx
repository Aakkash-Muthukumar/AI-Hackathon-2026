/**
 * Syncs scaffold_user_id from the web dashboard (localStorage) into extension storage
 * so assignments created in the dashboard appear in the extension sidebar.
 */
import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["http://localhost:3000/*", "http://127.0.0.1:3000/*"],
  run_at: "document_idle",
}

const USER_ID_KEY = "scaffold_user_id"

function syncUserId() {
  const id = localStorage.getItem(USER_ID_KEY)
  if (id) {
    chrome.runtime.sendMessage({ type: "SYNC_USER_ID", userId: id })
  }
}

syncUserId()
window.addEventListener("storage", (e) => {
  if (e.key === USER_ID_KEY && e.newValue) {
    chrome.runtime.sendMessage({ type: "SYNC_USER_ID", userId: e.newValue })
  }
})
