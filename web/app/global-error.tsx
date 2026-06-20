"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-700">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-gray-500">
            This error has been reported automatically.
          </p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-scaffold-500 text-white rounded-lg text-sm hover:bg-scaffold-600 transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
