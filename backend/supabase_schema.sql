-- Scaffold — Supabase schema
-- Run this in the Supabase SQL editor (or via psql) before starting the backend.
-- Matches the Assignment model in backend/models/schemas.py.

create table if not exists public.assignments (
    id                  text primary key,
    user_id             text,
    title               text        not null,
    deadline            timestamptz,
    source              text        not null default 'manual',
    prompt              text        not null default '',
    rubric              jsonb       not null default '[]'::jsonb,
    tasks               jsonb       not null default '[]'::jsonb,
    overall_completion  double precision not null default 0,
    document_url        text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- list_assignments() orders by deadline and may filter by user_id.
create index if not exists assignments_deadline_idx on public.assignments (deadline);
create index if not exists assignments_user_id_idx  on public.assignments (user_id);

-- The backend talks to Supabase with the service role key, which bypasses RLS.
-- Enable RLS so that anon/public keys cannot read or write directly.
alter table public.assignments enable row level security;

-- Persisted Google Docs evaluation results (one row per doc+assignment pair).
-- doc_marker stores the Drive modifiedTime at eval time so staleness can be detected
-- without calling Claude on every page open.
create table if not exists public.doc_evaluations (
    doc_id          text        not null,
    assignment_id   text        not null,
    evaluation      jsonb       not null,
    doc_marker      text        not null,
    updated_at      timestamptz not null default now(),
    primary key (doc_id, assignment_id)
);

create index if not exists doc_eval_assignment_idx on public.doc_evaluations (assignment_id);
alter table public.doc_evaluations enable row level security;
