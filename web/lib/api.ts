import { Assignment } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
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
    sync: (platform: string, credentials: Record<string, string>) =>
      request<{ status: string; message: string }>("/discovery/sync", {
        method: "POST",
        body: JSON.stringify({ platform, credentials }),
      }),

    supported: () =>
      request<{ platforms: { id: string; name: string; status: string }[] }>(
        "/discovery/supported"
      ),
  },
};
