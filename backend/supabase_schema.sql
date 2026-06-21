-- Scaffold — Supabase schema
-- Run this in the Supabase SQL editor (or via psql) before starting the backend.
-- Matches the Assignment model in backend/models/schemas.py.

CREATE TABLE IF NOT EXISTS public.assignments (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT,
    title               TEXT        NOT NULL,
    deadline            TIMESTAMPTZ,
    source              TEXT        NOT NULL DEFAULT 'manual',
    prompt              TEXT        NOT NULL DEFAULT '',
    rubric              JSONB       NOT NULL DEFAULT '[]'::JSONB,
    tasks               JSONB       NOT NULL DEFAULT '[]'::JSONB,
    overall_completion  DOUBLE PRECISION NOT NULL DEFAULT 0,
    document_url        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- list_assignments() orders by deadline and may filter by user_id.
CREATE INDEX IF NOT EXISTS assignments_deadline_idx ON public.assignments (deadline);
CREATE INDEX IF NOT EXISTS assignments_user_id_idx  ON public.assignments (user_id);

-- The backend talks to Supabase with the service role key, which bypasses RLS.
-- Enable RLS so that anon/public keys cannot read or write directly.
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- Persisted Google Docs evaluation results (one row per doc+assignment pair).
-- doc_marker stores the Drive modifiedTime at eval time so staleness can be detected
-- without calling Claude on every page open.
CREATE TABLE IF NOT EXISTS public.doc_evaluations (
    doc_id          TEXT        NOT NULL,
    assignment_id   TEXT        NOT NULL,
    evaluation      JSONB       NOT NULL,
    doc_marker      TEXT        NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (doc_id, assignment_id)
);

CREATE INDEX IF NOT EXISTS doc_eval_assignment_idx ON public.doc_evaluations (assignment_id);
ALTER TABLE public.doc_evaluations ENABLE ROW LEVEL SECURITY;
