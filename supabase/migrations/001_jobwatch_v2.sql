-- Additive migration: the original public.jobs table is preserved.
create table if not exists public.jw_settings (
  id integer primary key check(id=1), profile jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.jw_jobs (
  id uuid primary key,
  fingerprint text not null unique,
  canonical_url text unique,
  data jsonb not null,
  status_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jw_jobs_score_idx on public.jw_jobs (((data->>'match_score')::integer) desc);
create table if not exists public.jw_job_sources (
  source text not null, board text not null, external_id text not null,
  job_id uuid not null references public.jw_jobs(id) on delete cascade,
  canonical_url text, active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  primary key(source,board,external_id)
);
create index if not exists jw_sources_url_idx on public.jw_job_sources(canonical_url);
create index if not exists jw_sources_job_idx on public.jw_job_sources(job_id);
create table if not exists public.jw_applications (
  job_id uuid primary key references public.jw_jobs(id) on delete cascade,
  status text not null default 'Nouvelles offres' check(status in ('Nouvelles offres','À analyser','À préparer','Prête','Envoyée','Relance','Entretien RH','Entretien Manager','Case Study / Final','Offre','Refus','Abandonnée')),
  note text not null default '', applied_at date, follow_up_at date,
  updated_at timestamptz not null default now()
);
create table if not exists public.jw_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jw_jobs(id) on delete cascade,
  status text not null, created_at timestamptz not null default now()
);
create table if not exists public.jw_runs (
  id uuid primary key, trigger text not null,
  started_at timestamptz not null default now(), finished_at timestamptz,
  status text not null default 'running', summary jsonb not null default '{}'
);
create table if not exists public.jw_boards (
  board text primary key, last_success_at timestamptz
);
create table if not exists public.jw_locks (
  name text primary key, owner uuid not null, expires_at timestamptz not null
);
create table if not exists public.jw_notifications (
  job_id uuid primary key references public.jw_jobs(id) on delete cascade,
  state text not null default 'pending' check(state in ('pending','sent','suppressed','failed')),
  attempts integer not null default 0, created_at timestamptz not null default now(),
  first_attempt_at timestamptz, sent_at timestamptz, last_error text, payload jsonb
);
alter table public.jw_notifications add column if not exists payload jsonb;
create table if not exists public.jw_login_limits (
  key text primary key, attempts integer not null, expires_at timestamptz not null
);
-- Server-only access. No browser Supabase key can read personal data.
do $$
declare t text; r text;
begin
  foreach t in array array['jw_settings','jw_jobs','jw_job_sources','jw_applications','jw_events','jw_runs','jw_boards','jw_locks','jw_notifications','jw_login_limits'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public',t);
    foreach r in array array['anon','authenticated'] loop
      if exists(select 1 from pg_roles where rolname=r) then
        execute format('revoke all on table public.%I from %I',t,r);
      end if;
    end loop;
  end loop;
end $$;
