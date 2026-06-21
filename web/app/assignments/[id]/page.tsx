"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Assignment } from "@/lib/types";
import { api } from "@/lib/api";
import { Header } from "@/components/Header";
import { ScaffoldLoader } from "@/components/ScaffoldLoader";
import { TaskList } from "@/components/TaskList";
import { ProgressBar } from "@/components/ProgressBar";
import { CompleteOverlay } from "@/components/CompleteOverlay";
import { ExternalLink, ChevronDown, ChevronUp, Clock, Trash2, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const EVAL_DEBOUNCE_MS = 10_000;
const LIVE_POLL_MS = 5_000;

export default function AssignmentDetail() {
  const { id } = useParams<{ id: string }>();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [docContent, setDocContent] = useState("");
  const [evalLoading, setEvalLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRubric, setShowRubric] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [completeTitle, setCompleteTitle] = useState("");
  const evalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leavingRef = useRef(false);

  const goToDashboard = useCallback(() => {
    leavingRef.current = true;
    window.location.href = "/";
  }, []);

  const load = useCallback(async (silent = false) => {
    if (leavingRef.current) return;
    if (!silent) setLoading(true);
    try {
      const a = await api.assignments.get(id, true);
      if (!leavingRef.current) setAssignment(a);
    } catch {
      if (!leavingRef.current && !silent) {
        goToDashboard();
      }
    } finally {
      if (!leavingRef.current && !silent) setLoading(false);
    }
  }, [id, goToDashboard]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!assignment?.document_url || assignment.status === "completed") return;
    const interval = window.setInterval(() => load(true), LIVE_POLL_MS);
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [assignment?.document_url, assignment?.status, load]);

  const evaluateProgress = useCallback(
    async (content: string) => {
      if (!content.trim() || leavingRef.current) return;
      setEvalLoading(true);
      try {
        const updated = await api.assignments.updateProgress(id, content);
        setAssignment(updated);
      } finally {
        setEvalLoading(false);
      }
    },
    [id]
  );

  function handleDocChange(value: string) {
    setDocContent(value);
    if (evalTimer.current) clearTimeout(evalTimer.current);
    evalTimer.current = setTimeout(() => evaluateProgress(value), EVAL_DEBOUNCE_MS);
  }

  async function handleComplete() {
    if (!confirm("Mark this assignment as completed?")) return;
    setActionLoading(true);
    try {
      const updated = await api.assignments.complete(id);
      setAssignment(updated);
      setCompleteTitle(updated.title);
      setShowComplete(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not mark assignment complete");
    } finally {
      setActionLoading(false);
    }
  }

  function handleCompleteDismiss() {
    setShowComplete(false);
    goToDashboard();
  }

  async function handleDelete() {
    if (
      !confirm(
        "Delete this assignment from Scaffold? Your Google Doc will not be deleted."
      )
    ) {
      return;
    }
    leavingRef.current = true;
    setActionLoading(true);
    try {
      await api.assignments.delete(id);
      goToDashboard();
    } catch (err) {
      leavingRef.current = false;
      setActionLoading(false);
      alert(err instanceof Error ? err.message : "Could not delete assignment");
    }
  }

  if (loading || !assignment) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex justify-center py-32">
          <ScaffoldLoader width={72} label="Loading assignment…" />
        </div>
      </div>
    );
  }

  const isCompleted = assignment.status === "completed";

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <CompleteOverlay
        show={showComplete}
        title={completeTitle}
        onDismiss={handleCompleteDismiss}
      />

      <main className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{assignment.title}</h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 flex-wrap">
                <span className="capitalize bg-gray-100 px-2 py-0.5 rounded">
                  {assignment.source.replace("_", " ")}
                </span>
                {isCompleted && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs font-medium">
                    <CheckCircle2 size={12} />
                    Completed
                  </span>
                )}
                {assignment.deadline && (
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    Due{" "}
                    {formatDistanceToNow(new Date(assignment.deadline), {
                      addSuffix: true,
                    })}
                  </span>
                )}
                {assignment.document_url && (
                  <a
                    href={assignment.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-scaffold-500 hover:underline"
                  >
                    Open document <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isCompleted && (
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-60"
                >
                  <CheckCircle2 size={15} />
                  Mark complete
                </button>
              )}
              <button
                type="button"
                onClick={handleDelete}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-60"
                title="Removes from Scaffold only — your Google Doc is kept"
              >
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Prompt
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {assignment.prompt}
            </p>
          </div>

          {assignment.rubric.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium hover:bg-gray-50"
                onClick={() => setShowRubric((s) => !s)}
              >
                Rubric ({assignment.rubric.length} criteria)
                {showRubric ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showRubric && (
                <div className="px-5 pb-4 space-y-2 border-t border-gray-100">
                  {assignment.rubric.map((r, i) => (
                    <div
                      key={i}
                      className="flex gap-3 py-2 border-b border-gray-50 last:border-0"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">{r.criterion}</p>
                        <p className="text-xs text-gray-500">{r.description}</p>
                      </div>
                      {r.points && (
                        <span className="text-xs font-mono text-gray-400 shrink-0">
                          {r.points} pts
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Paste or type your draft
              </p>
              {evalLoading && (
                <ScaffoldLoader width={28} label="Evaluating…" className="!flex-row !gap-2" />
              )}
            </div>
            <textarea
              className="w-full h-72 resize-none text-sm text-gray-800 outline-none leading-relaxed placeholder:text-gray-300"
              placeholder="Paste your current draft here. Requirements are evaluated automatically as you write."
              value={docContent}
              onChange={(e) => handleDocChange(e.target.value)}
              disabled={isCompleted}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Overall progress
            </p>
            <ProgressBar value={assignment.overall_completion} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Requirements
              </p>
              {assignment.document_url && !isCompleted && (
                <span className="text-xs text-scaffold-500">Live from Google Doc</span>
              )}
            </div>
            <TaskList tasks={assignment.tasks} />
          </div>
        </div>
      </main>
    </div>
  );
}
