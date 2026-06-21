import { Assignment } from "./types";
import { getUserId } from "./userId";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

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
  return res.json() as Promise<T>;
}

export const api = {
  assignments: {
    list: () => request<Assignment[]>("/assignments/"),

    get: (id: string) => request<Assignment>(`/assignments/${id}`),

    create: (body: {
      title: string;
      prompt: string;
      source?: string;
      deadline?: string;
      rubric?: unknown[];
      document_url?: string;
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
  },

  discovery: {
    connect: (platform: string, userId: string) =>
      request<{
        session_id: string;
        live_view_url: string;
        context_id: string;
        platform: string;
      }>("/discovery/connect", {
        method: "POST",
        body: JSON.stringify({ platform, user_id: userId }),
      }),

    scrape: (
      platform: string,
      sessionId: string,
      contextId: string,
      userId: string
    ) =>
      request<{ status: string; message: string }>("/discovery/scrape", {
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
};
