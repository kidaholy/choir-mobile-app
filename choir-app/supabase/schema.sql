-- =============================================================================
-- Choir Team Management — core slice schema
--
-- Run once in: Supabase Dashboard -> SQL Editor -> New query
--
-- Design notes
--  * `members` is the roster and the source of truth for who serves what.
--    It holds BOTH people with a login (user_id set) and people an admin
--    entered who have no phone/account yet (user_id null).
--  * Nothing here stores money, songs or reports yet — those come in later
--    milestones. This slice is: login, roles, members, programs, assignments.
--  * RLS is the permission model. `public.is_admin()` is SECURITY DEFINER so
--    policies can read the caller's admin flag without recursing into members.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.is_admin
       from public.members m
      where m.user_id = auth.uid()),
    false
  );
$$;

-- Explicitly usable by the roles that evaluate RLS policies. (Do NOT revoke
-- this from the role that runs the signup trigger — that would break signups.)
grant execute on function public.is_admin() to authenticated, service_role;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- members — the choir roster
-- -----------------------------------------------------------------------------
create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  -- Set once the person creates an account; null for admin-entered people
  -- who have not signed up yet.
  user_id    uuid unique references auth.users (id) on delete set null,
  full_name  text not null check (length(trim(full_name)) > 0),
  email      text,
  phone      text,
  voice_part text,
  -- The admin/member permission flag used by every policy below.
  is_admin   boolean not null default false,
  is_active  boolean not null default true,
  joined_on  date    not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One login per roster entry, and one roster entry per email so a signup can
-- be linked to a person the admin already added. Null emails are exempt.
create unique index if not exists members_email_uk
  on public.members (lower(email)) where email is not null;

create index if not exists idx_members_active on public.members (is_active);

create trigger members_touch_updated_at
  before update on public.members
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- assignment_roles — fully customizable duty categories
-- -----------------------------------------------------------------------------
create table if not exists public.assignment_roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  description text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- The categories named in the requirements. Admins add, rename, reorder and
-- deactivate freely; these are just sensible starting values.
insert into public.assignment_roles (name, description, sort_order)
values
  ('Preaching',      'Deliver the sermon / exhortation', 1),
  ('Opening prayer', 'Open the service in prayer',       2),
  ('Closing prayer', 'Close the service in prayer',      3),
  ('Bible reading',  'Read the scripture portion',       4),
  ('Song leading',   'Lead the congregation in song',    5),
  ('Instrumentalist','Play for the service',             6),
  ('Choir duty',     'Other choir duties',               7)
on conflict (name) do nothing;

-- -----------------------------------------------------------------------------
-- programs — annual / monthly / weekly / occasional events
-- -----------------------------------------------------------------------------
create table if not exists public.programs (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(trim(title)) > 0),
  program_type  text not null default 'occasional'
                check (program_type in ('annual', 'monthly', 'weekly', 'occasional')),
  scheduled_for date not null,
  description   text,
  status        text not null default 'planned'
                check (status in ('planned', 'completed', 'cancelled')),
  created_by    uuid references public.members (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_programs_scheduled on public.programs (scheduled_for desc);
create index if not exists idx_programs_status    on public.programs (status);

create trigger programs_touch_updated_at
  before update on public.programs
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- program_assignments — who serves which duty on which program
--
-- The two unique constraints encode two of the requirements at the database
-- level so they cannot be violated even by a bad client:
--   * unique (program_id, role_id)  -> each role is filled exactly once
--   * unique (program_id, member_id) -> nobody holds two roles on the same day
-- -----------------------------------------------------------------------------
create table if not exists public.program_assignments (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs (id)  on delete cascade,
  member_id   uuid not null references public.members (id)   on delete cascade,
  role_id     uuid not null references public.assignment_roles (id) on delete cascade,
  status      text not null default 'assigned'
              check (status in ('assigned', 'completed', 'absent')),
  notes       text,
  -- Kept for fairness/rotation: the algorithm prefers members served least.
  assigned_on date not null default current_date,
  created_at  timestamptz not null default now(),
  unique (program_id, role_id),
  unique (program_id, member_id)
);

create index if not exists idx_assignments_program on public.program_assignments (program_id);
create index if not exists idx_assignments_member  on public.program_assignments (member_id);
create index if not exists idx_assignments_role    on public.program_assignments (role_id);
create index if not exists idx_assignments_on      on public.program_assignments (assigned_on desc);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.members           enable row level security;
alter table public.assignment_roles  enable row level security;
alter table public.programs          enable row level security;
alter table public.program_assignments enable row level security;-- members: everyone signed in can see the roster; you edit yourself; admins
-- do everything.
--
-- The UPDATE policy carries a deliberate WITH CHECK: a non-admin may only
-- touch their own row and may not set is_admin to true, so nobody can
-- promote themselves. This must be ONE policy — two overlapping permissive
-- policies are OR'd together, which would widen access instead of
-- restricting it.
drop policy if exists members_read   on public.members;
drop policy if exists members_update on public.members;
drop policy if exists members_insert on public.members;
drop policy if exists members_delete on public.members;

create policy members_read   on public.members
  for select to authenticated using (true);

create policy members_update on public.members
  for update to authenticated
  using (public.is_admin() or user_id = auth.uid())
  with check (
    public.is_admin()
    or (user_id = auth.uid() and is_admin = false)
  );

create policy members_insert on public.members
  for insert to authenticated
  with check (public.is_admin());

create policy members_delete on public.members
  for delete to authenticated
  using (public.is_admin());

-- assignment_roles: readable by all members, managed by admins.
drop policy if exists roles_read   on public.assignment_roles;
drop policy if exists roles_insert on public.assignment_roles;
drop policy if exists roles_update on public.assignment_roles;
drop policy if exists roles_delete on public.assignment_roles;

create policy roles_read   on public.assignment_roles
  for select to authenticated using (true);
create policy roles_insert on public.assignment_roles
  for insert to authenticated with check (public.is_admin());
create policy roles_update on public.assignment_roles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy roles_delete on public.assignment_roles
  for delete to authenticated using (public.is_admin());

-- programs: everyone reads, admins write.
drop policy if exists programs_read   on public.programs;
drop policy if exists programs_insert on public.programs;
drop policy if exists programs_update on public.programs;
drop policy if exists programs_delete on public.programs;

create policy programs_read   on public.programs
  for select to authenticated using (true);
create policy programs_insert on public.programs
  for insert to authenticated with check (public.is_admin());
create policy programs_update on public.programs
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy programs_delete on public.programs
  for delete to authenticated using (public.is_admin());

-- program_assignments: everyone reads; admins write; a member may update the
-- status/notes of their OWN duty (mark it completed) but cannot reassign it.
drop policy if exists assignments_read   on public.program_assignments;
drop policy if exists assignments_insert on public.program_assignments;
drop policy if exists assignments_update on public.program_assignments;
drop policy if exists assignments_delete on public.program_assignments;

create policy assignments_read on public.program_assignments
  for select to authenticated using (true);

create policy assignments_insert on public.program_assignments
  for insert to authenticated with check (public.is_admin());

create policy assignments_update on public.program_assignments
  for update to authenticated
  using (
    public.is_admin()
    or member_id in (select id from public.members where user_id = auth.uid())
  )
  with check (
    public.is_admin()
    or member_id in (select id from public.members where user_id = auth.uid())
  );

create policy assignments_delete on public.program_assignments
  for delete to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Signup: link the new account to a roster entry the admin already created,
-- or create the roster entry. SECURITY DEFINER so it bypasses RLS.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_name      text;
begin
  v_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(coalesce(new.email, ''), '@', 1),
    'New member'
  );

  -- Prefer linking to a roster row an admin created for this email.
  select id into v_member_id
    from public.members
   where user_id is null
     and email is not null
     and lower(email) = lower(new.email)
   limit 1;

  if v_member_id is not null then
    update public.members
       set user_id = new.id, updated_at = now()
     where id = v_member_id;
  else
    -- `on conflict do nothing` (no target) swallows any unique collision —
    -- realistically a duplicate email from an earlier roster row. Losing a
    -- roster row is recoverable by an admin; failing the signup is not.
    insert into public.members (user_id, full_name, email, is_admin, is_active)
    values (new.id, v_name, new.email, false, true)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
