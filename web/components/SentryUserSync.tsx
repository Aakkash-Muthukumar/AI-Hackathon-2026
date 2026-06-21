"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { getUserId } from "@/lib/userId";

/** Syncs the Scaffold user id to Sentry so web errors tie to the same user as the API. */
export function SentryUserSync() {
  useEffect(() => {
    const userId = getUserId();
    if (userId) {
      Sentry.setUser({ id: userId });
    }
  }, []);

  return null;
}
