import * as Sentry from "@sentry/nextjs";

export function captureApiError(path: string, status: number, detail: string) {
  Sentry.captureException(new Error(`API ${path} → ${status}`), {
    tags: { api_path: path, http_status: String(status) },
    extra: { detail },
  });
}

export function trackUserAction(action: string, data?: Record<string, string>) {
  Sentry.addBreadcrumb({
    category: "user",
    message: action,
    level: "info",
    data,
  });
}
