"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Header } from "@/components/Header";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Lock,
  ChevronRight,
} from "lucide-react";

interface Platform {
  id: string;
  name: string;
  status: string;
}

interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password" | "email" | "url";
  placeholder?: string;
}

// Credential fields required by each backend discovery handler
// (see backend/services/browserbase_service.py).
const CREDENTIAL_FIELDS: Record<string, CredentialField[]> = {
  canvas: [
    { key: "canvas_url", label: "Canvas URL", type: "url", placeholder: "https://canvas.instructure.com" },
    { key: "username", label: "Username", type: "text" },
    { key: "password", label: "Password", type: "password" },
  ],
  notion: [
    { key: "email", label: "Email", type: "email" },
    { key: "password", label: "Password", type: "password" },
  ],
  google_classroom: [
    { key: "email", label: "Google account email", type: "email" },
  ],
};

export default function Connect() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.discovery
      .supported()
      .then((res) => setPlatforms(res.platforms))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  function selectPlatform(id: string) {
    setActive(id);
    setCredentials({});
    setMessage(null);
    setError(null);
  }

  async function handleSync(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    setSyncing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api.discovery.sync(active, credentials);
      setMessage(res.message);
      setActive(null);
      setCredentials({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-3xl mx-auto px-6 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Connect a platform</h1>
        <p className="text-sm text-gray-500 mb-8">
          Auto-discover assignments from your learning tools. Credentials are sent to the
          backend to drive a one-time browser session and are not stored by the dashboard.
        </p>

        {message && (
          <div className="mb-6 flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            <span>{message}</span>
          </div>
        )}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-gray-200 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {platforms.map((p) => {
              const supported = p.status === "supported";
              const isActive = active === p.id;
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-gray-200 bg-white overflow-hidden"
                >
                  <button
                    disabled={!supported}
                    onClick={() => (isActive ? setActive(null) : selectPlatform(p.id))}
                    className="w-full flex items-center justify-between px-5 py-4 text-left disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-900">{p.name}</span>
                      {!supported && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          Coming soon
                        </span>
                      )}
                    </div>
                    {supported ? (
                      <ChevronRight
                        size={18}
                        className={`text-gray-400 transition-transform ${
                          isActive ? "rotate-90" : ""
                        }`}
                      />
                    ) : (
                      <Lock size={16} className="text-gray-300" />
                    )}
                  </button>

                  {isActive && supported && (
                    <form
                      onSubmit={handleSync}
                      className="px-5 pb-5 pt-1 space-y-4 border-t border-gray-100"
                    >
                      {(CREDENTIAL_FIELDS[p.id] ?? []).map((field) => (
                        <div key={field.key}>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            {field.label}
                          </label>
                          <input
                            type={field.type}
                            value={credentials[field.key] ?? ""}
                            placeholder={field.placeholder}
                            onChange={(e) =>
                              setCredentials((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            className="input"
                            required
                          />
                        </div>
                      ))}
                      <button
                        type="submit"
                        disabled={syncing}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-scaffold-500 text-white text-sm font-medium rounded-lg hover:bg-scaffold-600 transition-colors disabled:opacity-60"
                      >
                        {syncing && <Loader2 size={16} className="animate-spin" />}
                        {syncing ? "Starting sync…" : `Sync from ${p.name}`}
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
