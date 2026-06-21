"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { getUserId } from "@/lib/userId";
import { Header } from "@/components/Header";
import { ScaffoldLoader } from "@/components/ScaffoldLoader";
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  ChevronRight,
  LogOut,
  MonitorSmartphone,
} from "lucide-react";

interface Platform {
  id: string;
  name: string;
  status: string;
}

type Step = "idle" | "opening" | "live" | "scraping" | "done";

interface ActiveSession {
  platform: string;
  sessionId: string;
  contextId: string;
  liveViewUrl: string;
}

export default function Connect() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("idle");
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [newAssignmentCount, setNewAssignmentCount] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const userId = getUserId();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ platforms: ps }, { connected_platforms }] = await Promise.all([
        api.discovery.supported(),
        api.discovery.status(userId),
      ]);
      setPlatforms(ps);
      setConnected(connected_platforms);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load platforms");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleConnect(platformId: string) {
    setStep("opening");
    setError(null);
    setDoneMessage(null);
    try {
      const res = await api.discovery.connect(platformId, userId);
      setSession({
        platform: platformId,
        sessionId: res.session_id,
        contextId: res.context_id,
        liveViewUrl: res.live_view_url,
      });
      setStep("live");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open browser session");
      setStep("idle");
    }
  }

  async function handleScrape() {
    if (!session) return;
    setStep("scraping");
    setError(null);
    setNewAssignmentCount(null);

    // Snapshot how many assignments exist right now so we can detect new ones.
    let baselineCount = 0;
    try {
      const existing = await api.assignments.list();
      baselineCount = existing.length;
    } catch {
      // Non-fatal — polling will still work, just won't show a delta.
    }

    try {
      await api.discovery.scrape(
        session.platform,
        session.sessionId,
        session.contextId,
        userId
      );
      const platform = session.platform;
      setStep("done");
      setSession(null);
      setDoneMessage(`Scanning ${platform} for assignments…`);
      setConnected((prev) => (prev.includes(platform) ? prev : [...prev, platform]));

      // Poll until new assignments appear (up to 2 minutes).
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const updated = await api.assignments.list();
          const added = updated.length - baselineCount;
          if (added > 0) {
            setNewAssignmentCount(added);
            setDoneMessage(
              `Found ${added} new assignment${added === 1 ? "" : "s"} from ${platform}.`
            );
            clearInterval(pollRef.current!);
            pollRef.current = null;
          } else if (attempts >= 40) {
            // 40 × 3 s = 2 min timeout
            setDoneMessage(
              `Scan complete. Check the dashboard — new assignments may take a moment to appear.`
            );
            clearInterval(pollRef.current!);
            pollRef.current = null;
          }
        } catch {
          // ignore transient fetch errors during polling
        }
      }, 3_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
      setStep("live");
    }
  }

  // Clean up poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function handleCancel() {
    setSession(null);
    setStep("idle");
    setError(null);
  }

  async function handleDisconnect(platformId: string) {
    try {
      await api.discovery.disconnect(userId, platformId);
      setConnected((prev) => prev.filter((p) => p !== platformId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect");
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
          A real browser opens and navigates to your platform. Log in yourself — Scaffold
          never sees your credentials. Once logged in, click <strong>Scan my tasks</strong>.
        </p>

        {doneMessage && (
          <div className="mb-6 flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            {newAssignmentCount !== null ? (
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            ) : (
              <ScaffoldLoader width={22} className="!gap-0 shrink-0" />
            )}
            <span>
              {doneMessage}{" "}
              {newAssignmentCount !== null && (
                <Link href="/" className="underline font-medium">View dashboard →</Link>
              )}
            </span>
          </div>
        )}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Live view panel */}
        {step === "live" && session && (
          <div className="mb-8 rounded-xl border border-scaffold-100 bg-white overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 bg-scaffold-50 border-b border-scaffold-100">
              <div className="flex items-center gap-2 text-sm font-semibold text-scaffold-700">
                <MonitorSmartphone size={16} />
                Live browser — {session.platform}
              </div>
              <span className="text-xs text-scaffold-500">
                Log in, then click &quot;Scan my tasks&quot; below
              </span>
            </div>
            <iframe
              src={session.liveViewUrl}
              className="w-full"
              style={{ height: 520, border: "none" }}
              allow="clipboard-read; clipboard-write"
            />
            <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={handleScrape}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-scaffold-500 text-white text-sm font-medium rounded-lg hover:bg-scaffold-600 transition-colors"
              >
                <CheckCircle2 size={16} />
                I&apos;m logged in — scan my tasks
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2.5 text-sm text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {step === "scraping" && (
          <div className="mb-8 flex justify-center rounded-xl border border-scaffold-100 bg-scaffold-50 px-5 py-8">
            <ScaffoldLoader width={64} label="Extracting assignments…" />
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <ScaffoldLoader width={64} label="Loading platforms…" />
          </div>
        ) : (
          <div className="space-y-3">
            {platforms.map((p) => {
              const supported = p.status === "supported";
              const isConnected = connected.includes(p.id);
              const isOpening = step === "opening" && session?.platform === p.id;

              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-gray-200 bg-white flex items-center justify-between px-5 py-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900">{p.name}</span>
                    {isConnected && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        Connected
                      </span>
                    )}
                    {!supported && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        Coming soon
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {supported && isConnected && (
                      <>
                        <button
                          onClick={() => handleConnect(p.id)}
                          disabled={step !== "idle" && step !== "done"}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-scaffold-600 border border-scaffold-200 rounded-lg hover:bg-scaffold-50 transition-colors disabled:opacity-40"
                        >
                          <ChevronRight size={12} />
                          Re-sync
                        </button>
                        <button
                          onClick={() => handleDisconnect(p.id)}
                          title="Disconnect"
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <LogOut size={14} />
                        </button>
                      </>
                    )}
                    {supported && !isConnected && (
                      <button
                        onClick={() => handleConnect(p.id)}
                        disabled={step !== "idle" && step !== "done"}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-scaffold-500 text-white text-sm font-medium rounded-lg hover:bg-scaffold-600 transition-colors disabled:opacity-40"
                      >
                        {isOpening ? (
                          <ScaffoldLoader width={16} className="!gap-0" />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                        {isOpening ? "Opening…" : "Connect"}
                      </button>
                    )}
                    {!supported && <Lock size={16} className="text-gray-300" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
