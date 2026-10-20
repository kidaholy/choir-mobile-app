-- Shared Lists — Supabase sync backbone
--
-- Design: phones stay the source of truth (each keeps its own SQLite DB).
-- This table is an append-only *op log*: every edit is one immutable row.
-- It is NOT the app's database — it is the buffer that lets a phone that
-- was offline catch up, plus the fan-out point for Realtime delivery.
--
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).

create table if not exists public.ops (
  op_id      text        primary key,          -- dedupe key, idempotent inserts
  list_id    text        not null,             -- the share code = room id
  origin     text        not null,             -- device that produced the op
  kind       text        not null,             -- 'list.set' | 'item.set'
  ts         bigint      not null,             -- client wall-clock (LWW stamp)
  payload    jsonb       not null,             -- the full op, replayed on pull
  created_at timestamptz not null default now() -- server clock, pull cursor
);

-- Catch-up pull: "give me everything in this list after this timestamp".
create index if not exists ops_list_created_idx
  on public.ops (list_id, created_at);

-- Safety net for clients that cursor by client clock instead of server clock.
create index if not exists ops_list_ts_idx
  on public.ops (list_id, ts);

-- RLS is enabled, and the two policies below are deliberately permissive:
-- the app runs on the public anon key with no user accounts, and the share
-- code is the only thing gating a list. This is fine for a shared-list app,
-- but it means anyone who has the anon key can read/write every list.
-- To lock it down later, add Supabase Auth and scope these policies with
-- `auth.uid()` plus a membership table — the app code does not change.
alter table public.ops enable row level security;

create policy "ops_select_all" on public.ops
  for select using (true);

create policy "ops_insert_all" on public.ops
  for insert with check (true);

-- No update/delete policies: the log is append-only. Clients cannot rewrite
-- history, which is what keeps the per-field LWW merge convergent.
