"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { AssignmentSource, RubricItem, SOURCE_LABELS } from "@/lib/types";
import { Header } from "@/components/Header";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { ScaffoldLoader } from "@/components/ScaffoldLoader";

const SELECTABLE_SOURCES: AssignmentSource[] = [
  "manual",
  "canvas",
  "notion",
  "google_classroom",
];

interface DraftRubricItem {
  criterion: string;
  description: string;
  points: string;
}

export default function NewAssignment() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [source, setSource] = useState<AssignmentSource>("manual");
  const [deadline, setDeadline] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [rubric, setRubric] = useState<DraftRubricItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        ...(deadline ? { deadline: new Date(deadline).toISOString() } : {}),
        ...(documentUrl.trim() ? { document_url: documentUrl.trim() } : {}),
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
          Add the prompt and rubric — Claude will break it into trackable tasks.
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

          <Field label="Document URL">
            <input
              type="url"
              value={documentUrl}
              onChange={(e) => setDocumentUrl(e.target.value)}
              placeholder="https://docs.google.com/document/…"
              className="input"
            />
          </Field>

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
              {submitting ? "Analyzing rubric…" : "Create assignment"}
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
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
