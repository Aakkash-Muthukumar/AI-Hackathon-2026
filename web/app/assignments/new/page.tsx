"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  AssignmentSource,
  RubricItem,
  SOURCE_LABELS,
  GuidanceLevel,
  GUIDANCE_LABELS,
  GUIDANCE_TASK_HINT,
} from "@/lib/types";
import { getUserId } from "@/lib/userId";
import { Header } from "@/components/Header";
import { ArrowLeft, Plus, Trash2, Link2, CheckCircle2 } from "lucide-react";
import { ScaffoldLoader } from "@/components/ScaffoldLoader";
import clsx from "clsx";

const SELECTABLE_SOURCES: AssignmentSource[] = [
  "manual",
  "canvas",
  "notion",
  "google_classroom",
];

const GUIDANCE_OPTIONS: GuidanceLevel[] = ["low", "medium", "high"];

interface DraftRubricItem {
  criterion: string;
  description: string;
  points: string;
}

export default function NewAssignment() {
  const router = useRouter();
  const userId = getUserId();

  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [source, setSource] = useState<AssignmentSource>("manual");
  const [deadline, setDeadline] = useState("");
  const [guidanceLevel, setGuidanceLevel] = useState<GuidanceLevel>("medium");
  const [rubric, setRubric] = useState<DraftRubricItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);

  useEffect(() => {
    api.google.status(userId).then((r) => setGoogleConnected(r.authorized)).catch(() => setGoogleConnected(false));
  }, [userId]);

  function updateRubric(index: number, patch: Partial<DraftRubricItem>) {
    setRubric((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  }

  function addRubricItem() {
    setRubric((prev) => [...prev, { criterion: "", description: "", points: "" }]);
  }

  function removeRubricItem(index: number) {
    setRubric((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !prompt.trim()) {
      setError("Title and prompt are required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const cleanRubric: RubricItem[] = rubric
        .filter((r) => r.criterion.trim())
        .map((r) => ({
          criterion: r.criterion.trim(),
          description: r.description.trim(),
          ...(r.points.trim() ? { points: Number(r.points) } : {}),
        }));

      const created = await api.assignments.create({
        title: title.trim(),
        prompt: prompt.trim(),
        source,
        guidance_level: guidanceLevel,
        ...(deadline ? { deadline: new Date(deadline).toISOString() } : {}),
        rubric: cleanRubric,
      });

      router.push(`/assignments/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create assignment.");
      setSubmitting(false);
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

        <h1 className="text-2xl font-bold text-gray-900 mb-1">New assignment</h1>
        <p className="text-sm text-gray-500 mb-8">
          Add the prompt and rubric — Claude will break it into trackable tasks. A Google Doc
          is created automatically when your Google account is connected.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Field label="Title" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Essay on Climate Change"
              className="input"
            />
          </Field>

          <Field label="Prompt" required>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Paste the full assignment instructions here…"
              className="input h-40 resize-y leading-relaxed"
            />
          </Field>

          <Field label="Guidance level" hint="Controls how many tasks the extension tracks">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {GUIDANCE_OPTIONS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setGuidanceLevel(level)}
                  className={clsx(
                    "rounded-xl border px-4 py-3 text-left transition-colors",
                    guidanceLevel === level
                      ? "border-scaffold-500 bg-scaffold-50 ring-2 ring-scaffold-500"
                      : "border-gray-200 bg-white hover:border-scaffold-300"
                  )}
                >
                  <span className="block text-sm font-semibold text-gray-900 capitalize">
                    {level}
                  </span>
                  <span className="block text-xs text-gray-500 mt-1">
                    {GUIDANCE_TASK_HINT[level]}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">{GUIDANCE_LABELS[guidanceLevel]}</p>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Field label="Source">
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as AssignmentSource)}
                className="input"
              >
                {SELECTABLE_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Deadline">
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="input"
              />
            </Field>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Google Doc</p>
                <p className="text-xs text-gray-500 mt-1">
                  A blank doc titled with your assignment name will be created in your Drive.
                </p>
              </div>
              {googleConnected === null ? (
                <ScaffoldLoader width={22} className="!gap-0 shrink-0" />
              ) : googleConnected ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 shrink-0">
                  <CheckCircle2 size={14} />
                  Connected
                </span>
              ) : (
                <a
                  href={api.google.authorizeUrl(userId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-scaffold-500 rounded-lg hover:bg-scaffold-600 shrink-0"
                >
                  <Link2 size={13} />
                  Connect Google
                </a>
              )}
            </div>
            {googleConnected === false && (
              <p className="text-xs text-amber-700 mt-3">
                Connect Google before creating to auto-generate the doc. You can still create
                without it and link a doc later.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Rubric</label>
              <button
                type="button"
                onClick={addRubricItem}
                className="inline-flex items-center gap-1 text-sm text-scaffold-600 hover:text-scaffold-700"
              >
                <Plus size={15} />
                Add criterion
              </button>
            </div>

            {rubric.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                No rubric criteria yet. Claude can still infer tasks from the prompt.
              </p>
            ) : (
              <div className="space-y-3">
                {rubric.map((item, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-gray-200 bg-white p-4 space-y-3"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="text"
                        value={item.criterion}
                        onChange={(e) =>
                          updateRubric(i, { criterion: e.target.value })
                        }
                        placeholder="Criterion (e.g. Thesis)"
                        className="input flex-1"
                      />
                      <input
                        type="number"
                        value={item.points}
                        onChange={(e) => updateRubric(i, { points: e.target.value })}
                        placeholder="Pts"
                        className="input w-20"
                        min={0}
                      />
                      <button
                        type="button"
                        onClick={() => removeRubricItem(i)}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        title="Remove"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) =>
                        updateRubric(i, { description: e.target.value })
                      }
                      placeholder="What this criterion requires"
                      className="input"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-scaffold-500 text-white text-sm font-medium rounded-lg hover:bg-scaffold-600 transition-colors disabled:opacity-60"
            >
              {submitting && <ScaffoldLoader width={20} className="!gap-0" />}
              {submitting ? "Creating…" : "Create assignment"}
            </button>
            <Link
              href="/"
              className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({
  label,
  required = false,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && (
          <span className="block text-xs font-normal text-gray-400 mt-0.5">{hint}</span>
        )}
      </label>
      {children}
    </div>
  );
}
