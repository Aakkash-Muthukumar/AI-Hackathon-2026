/**
 * Shared user-ID utility for the web app.
 *
 * If a `?uid=` query param is present — which the Chrome extension appends
 * when opening the dashboard — that value is adopted and persisted to
 * localStorage so every subsequent page in this session uses the same ID
 * as the extension. The param is then removed from the URL without a reload.
 *
 * In all other cases we fall back to whatever is already in localStorage,
 * creating a fresh UUID only on a brand-new visit.
 */
export function getUserId(): string {
  if (typeof window === "undefined") return "";

  const params = new URLSearchParams(window.location.search);
  const urlUid = params.get("uid");
  if (urlUid) {
    localStorage.setItem("scaffold_user_id", urlUid);
    const clean = new URL(window.location.href);
    clean.searchParams.delete("uid");
    window.history.replaceState({}, "", clean);
    return urlUid;
  }

  const stored = localStorage.getItem("scaffold_user_id");
  if (stored) return stored;

  const id = crypto.randomUUID();
  localStorage.setItem("scaffold_user_id", id);
  return id;
}
