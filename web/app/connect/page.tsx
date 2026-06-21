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
  startUrl?: string | null;
  preferNewTab?: boolean;
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
  const [liveViewDisconnected, setLiveViewDisconnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const sessionRef = useRef<ActiveSession | null>(null);
  const stepRef = useRef<Step>("idle");

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

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  async function handleConnect(platformId: string) {
    setStep("opening");
    setError(null);
    setDoneMessage(null);
    try {
      const res = await api.discovery.connect(platformId, userId);
      const nextSession: ActiveSession = {
        platform: platformId,
        sessionId: res.session_id,
        contextId: res.context_id,
        liveViewUrl: res.live_view_url,
        startUrl: res.start_url,
        preferNewTab: res.prefer_new_tab,
      };
      setSession(nextSession);
      setLiveViewDisconnected(false);
      setIframeKey((k) => k + 1);
      setStep("live");
      if (res.prefer_new_tab) {
        window.open(res.live_view_url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open browser session");
      setStep("idle");
    }
  }

  async function handleScrape() {
    if (!session) return;
    setStep("scraping");
    setError(null);
    setDoneMessage(null);
    setNewAssignmentCount(null);

    const platform = session.platform;
    const sessionId = session.sessionId;
    const contextId = session.contextId;

    try {
      const res = await api.discovery.scrape(
        platform,
        sessionId,
        contextId,
        userId
      );
      setSession(null);
      setStep("done");

      if (res.status === "empty") {
        setError(res.message);
        setStep("idle");
        return;
      }

      const saved = res.assignments_saved ?? 0;
      if (saved > 0) {
        setNewAssignmentCount(saved);
        setDoneMessage(res.message);
        setConnected((prev) => (prev.includes(platform) ? prev : [...prev, platform]));
      } else {
        setError(res.message || "Scan finished but no assignments were saved.");
        setStep("idle");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
      setSession(null);
      setStep("idle");
    }
  }

  // Browserbase live view posts this when its WebSocket drops
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data === "browserbase-disconnected") {
        setLiveViewDisconnected(true);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function handleReconnectLiveView() {
    if (!session) return;
    setReconnecting(true);
    setError(null);
    try {
      const res = await api.discovery.refreshLiveView(session.sessionId);
      setSession({ ...session, liveViewUrl: res.live_view_url });
      setLiveViewDisconnected(false);
      setIframeKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reconnect live browser");
    } finally {
      setReconnecting(false);
    }
  }

  async function handleCancel() {
    const active = sessionRef.current;
    setCancelling(true);
    setSession(null);
    setStep("idle");
    setError(null);
    setLiveViewDisconnected(false);
    try {
      if (active?.sessionId) {
        await api.discovery.cancelSession(active.sessionId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not close browser session");
    } finally {
      setCancelling(false);
    }
  }

  // Terminate orphaned connect sessions if the user leaves mid-login
  useEffect(() => {
    return () => {
      if (stepRef.current !== "live") return;
      const active = sessionRef.current;
      if (active?.sessionId) {
        api.discovery.cancelSession(active.sessionId).catch(() => {});
      }
    };
  }, []);

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
              <div className="flex items-center gap-3">
                <a
                  href={session.liveViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-scaffold-600 hover:text-scaffold-800 underline"
                >
                  Open in new tab
                </a>
                <span className="text-xs text-scaffold-500">
                  Log in, then click &quot;Scan my tasks&quot; below
                </span>
              </div>
            </div>
            {session.preferNewTab ? (
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 text-sm text-amber-900">
                <strong>Log in via the new tab</strong> that just opened — Notion and
                Google use pop-up sign-in that doesn&apos;t work well inside an embedded
                frame. After logging in there, return here and click{" "}
                <strong>Scan my tasks</strong>.
              </div>
            ) : session.startUrl ? (
              <div className="px-5 py-2.5 bg-scaffold-50 border-b border-scaffold-100 text-xs text-scaffold-700">
                Should open{" "}
                <span className="font-medium">{session.startUrl}</span> automatically.
                If the page is blank, use the address bar or{" "}
                <a
                  href={session.liveViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline"
                >
                  open the live browser in a new tab
                </a>
                .
              </div>
            ) : null}
            {liveViewDisconnected && (
              <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-red-50 border-b border-red-100 text-xs text-red-700">
                <span>Live browser disconnected.</span>
                <button
                  type="button"
                  onClick={handleReconnectLiveView}
                  disabled={reconnecting}
                  className="shrink-0 rounded-md border border-red-300 bg-white px-2.5 py-1 font-medium hover:bg-red-50 disabled:opacity-50"
                >
                  {reconnecting ? "Reconnecting…" : "Reconnect"}
                </button>
              </div>
            )}
            <iframe
              key={iframeKey}
              src={session.liveViewUrl}
              className="w-full"
              style={{ height: 520, border: "none" }}
              allow="clipboard-read; clipboard-write"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
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
                disabled={cancelling}
                className="px-4 py-2.5 text-sm text-gray-600 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {cancelling ? "Closing…" : "Cancel"}
              </button>
            </div>
          </div>
        )}

        {step === "scraping" && (
          <div className="mb-8 flex flex-col items-center gap-2 rounded-xl border border-scaffold-100 bg-scaffold-50 px-5 py-8">
            <ScaffoldLoader width={64} label="Scanning for assignments…" />
            <p className="text-xs text-scaffold-600 max-w-md text-center">
              This uses AI to explore your workspace and may take 1–2 minutes.
            </p>
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
