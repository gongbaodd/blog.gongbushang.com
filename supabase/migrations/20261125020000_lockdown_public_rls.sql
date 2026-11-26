-- SEC-01 (GON-193): Lock down public.* (and derived.*) against Supabase PostgREST Data API roles.
--
-- Idempotent: safe to apply via `supabase db push` and safe to re-run directly after any future
-- `emdash migrate` that creates new tables in `public`.
--
-- Why this does not break EmDash or derive:
--   All EmDash tables in `public` and cache tables in `derived` are owned by `postgres`.
--   Table owners (and roles with BYPASSRLS) bypass Row Level Security unless FORCE ROW LEVEL
--   SECURITY is set, so `apps/admin`, `apps/web` build/cron, and `derive` continue working
--   untouched while `anon` and `authenticated` have zero schema/object privileges and zero
--   permissive RLS policies.
--
-- See docs/plan/emdash/runbooks/supabase.md ("Security: PostgREST Data API & RLS lockdown (SEC-01)").

do $$
declare
  r record;
  role_name text;
  schema_name text;
  can_alter_postgres_defaults boolean := false;
begin
  -- 1. Enable RLS on every table in `public` (no policies => deny-all for non-owner roles).
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;

  -- Defense-in-depth: also ensure RLS is enabled on every table in `derived`, if present.
  if exists (select 1 from pg_namespace where nspname = 'derived') then
    for r in
      select tablename
      from pg_tables
      where schemaname = 'derived'
    loop
      execute format('alter table derived.%I enable row level security', r.tablename);
    end loop;
  end if;

  -- 2. Revoke existing and default privileges from Supabase Data API roles (`anon`, `authenticated`).
  --    Guarded by pg_roles and pg_namespace so vanilla Postgres and fresh DBs without `derived`
  --    succeed without error.
  if exists (select 1 from pg_roles where rolname = 'postgres') then
    can_alter_postgres_defaults := pg_has_role('postgres', 'member');
  end if;

  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      foreach schema_name in array array['public', 'derived'] loop
        if exists (select 1 from pg_namespace where nspname = schema_name) then
          execute format('revoke all on schema %I from %I', schema_name, role_name);
          execute format('revoke all on all tables in schema %I from %I', schema_name, role_name);
          execute format('revoke all on all sequences in schema %I from %I', schema_name, role_name);
          execute format('revoke all on all functions in schema %I from %I', schema_name, role_name);

          if can_alter_postgres_defaults then
            execute format(
              'alter default privileges for role postgres in schema %I revoke all on tables from %I',
              schema_name,
              role_name
            );
            execute format(
              'alter default privileges for role postgres in schema %I revoke all on sequences from %I',
              schema_name,
              role_name
            );
            execute format(
              'alter default privileges for role postgres in schema %I revoke all on functions from %I',
              schema_name,
              role_name
            );
          end if;
        end if;
      end loop;
    end if;
  end loop;

  -- 3. Functions get EXECUTE for PUBLIC by default, which `revoke ... from anon` cannot remove (GON-193 review).
  --    Only the owner (`postgres`) needs to call them: trigger functions fire regardless of EXECUTE, and the
  --    growgen_backup / growgen_ci_readonly roles (supabase/roles/) only read tables.
  foreach schema_name in array array['public', 'derived'] loop
    if exists (select 1 from pg_namespace where nspname = schema_name) then
      execute format('revoke execute on all functions in schema %I from public', schema_name);
      if can_alter_postgres_defaults then
        execute format(
          'alter default privileges for role postgres in schema %I revoke execute on functions from public',
          schema_name
        );
      end if;
    end if;
  end loop;
end $$;
