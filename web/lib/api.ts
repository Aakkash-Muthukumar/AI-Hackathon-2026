import { Assignment } from "./types";
import { getUserId } from "./userId";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const BACKEND_ROOT = BASE.replace(/\/api\/?$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const userId = getUserId();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(userId ? { "X-User-ID": userId } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path} → ${res.status}: ${err}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export const api = {
  assignments: {
    list: () => request<Assignment[]>("/assignments/"),

    get: (id: string, fresh = false) =>
      request<Assignment>(`/assignments/${id}${fresh ? "?fresh=true" : ""}`),

    create: (body: {
      title: string;
      prompt: string;
      source?: string;
      deadline?: string;
      rubric?: unknown[];
      document_url?: string;
      guidance_level?: string;
    }) =>
      request<Assignment>("/assignments/", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    updateProgress: (id: string, documentContent: string) =>
      request<Assignment>(`/assignments/${id}/progress`, {
        method: "POST",
        body: JSON.stringify({
          assignment_id: id,
          document_content: documentContent,
        }),
      }),

    history: (id: string) =>
      request<{ history: { ts: number; completion: number }[] }>(
        `/assignments/${id}/history`
      ),

    delete: (id: string) =>
      request<void>(`/assignments/${id}`, { method: "DELETE" }),

    complete: (id: string) =>
      request<Assignment>(`/assignments/${id}/complete`, { method: "POST" }),

    createDocument: (id: string) =>
      request<Assignment>(`/assignments/${id}/create-document`, { method: "POST" }),
  },

  discovery: {
    connect: (platform: string, userId: string) =>
      request<{
        session_id: string;
        live_view_url: string;
        context_id: string;
        platform: string;
        start_url?: string | null;
        prefer_new_tab?: boolean;
      }>("/discovery/connect", {
        method: "POST",
        body: JSON.stringify({ platform, user_id: userId }),
      }),

    refreshLiveView: (sessionId: string) =>
      request<{ session_id: string; live_view_url: string }>(
        `/discovery/sessions/${sessionId}/live-view`
      ),

    cancelSession: (sessionId: string) =>
      request<{ status: string; session_id: string }>(
        `/discovery/sessions/${sessionId}/cancel`,
        { method: "POST" }
      ),

    scrape: (
      platform: string,
      sessionId: string,
      contextId: string,
      userId: string
    ) =>
      request<{
        status: string;
        platform: string;
        message: string;
        assignments_found?: number;
        assignments_saved?: number;
      }>("/discovery/scrape", {
        method: "POST",
        body: JSON.stringify({
          platform,
          session_id: sessionId,
          context_id: contextId,
          user_id: userId,
        }),
      }),

    status: (userId: string) =>
      request<{ user_id: string; connected_platforms: string[] }>(
        `/discovery/status/${userId}`
      ),

    disconnect: (userId: string, platform: string) =>
      request<{ status: string; platform: string }>(
        `/discovery/disconnect/${userId}/${platform}`,
        { method: "DELETE" }
      ),

    supported: () =>
      request<{ platforms: { id: string; name: string; status: string }[] }>(
        "/discovery/supported"
      ),
  },

  google: {
    status: (userId: string) =>
      fetch(`${BACKEND_ROOT}/auth/google/status?user_id=${encodeURIComponent(userId)}`).then(
        async (res) => {
          if (!res.ok) throw new Error("Could not check Google connection");
          return res.json() as Promise<{ authorized: boolean }>;
        }
      ),

    authorizeUrl: (userId: string) =>
      `${BACKEND_ROOT}/auth/google/authorize?user_id=${encodeURIComponent(userId)}`,
  },
};
