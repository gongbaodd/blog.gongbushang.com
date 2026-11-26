-- SEC-11 (GON-198): narrowly scoped, read-only role for pull-request CI (`web-ci`, GitHub environment `ci-readonly`, secret
-- DATABASE_POOLER_URL). PR builds read the production database (INF-10) for `emdash migrate --check`, EmDash's prerender and
-- `derive` with DERIVE_READONLY=1. This role can read ONLY what those steps read, and cannot write anything.
--
-- NOT a migration (never applied by `supabase start` / `db push`). OWNER-ONLY, by hand, as `postgres`
-- (docs/plan/emdash/runbooks/ci.md "Read-only CI role"). Idempotent (also upgrades the earlier broad version), no password:
--
--   psql "$SUPABASE_PRODUCTION_POOLER_URL" -v ON_ERROR_STOP=1 -f supabase/roles/growgen_ci_readonly.sql
--   psql "$SUPABASE_PRODUCTION_POOLER_URL" -c '\password growgen_ci_readonly'
--
-- Then the ci-readonly secret DATABASE_POOLER_URL becomes
--   postgresql://growgen_ci_readonly.<project-ref>:<password>@<pooler-host>:5432/postgres   (session pooler, IPv4)
--
-- Table list: measured, not guessed (GON-198). On local Supabase, `emdash migrate --from-config --check` plus a full
-- `DERIVE_READONLY=1 pnpm --filter web build` were run as this role with log_statement=all (and pg_stat_user_tables scan
-- counters diffed); every table named in any statement it sent is in this list, then the build was re-run with only these grants.
-- Tables read: the public ones in `ci_tables` below, every `ec_*` collection table, and the `derived` cache. Nothing else.
-- Re-run this script after adding an EmDash collection (new `ec_*` table) or a derived table; a CI build that suddenly
-- prerenders an empty collection or fails with "permission denied for table X" means X must be added here (after checking X
-- holds no tokens, sessions or secrets).
--
-- No BYPASSRLS: SEC-01 enabled RLS (no policies) on every public/derived table, so each granted table gets a SELECT-only
-- policy for this role alone (`growgen_ci_readonly_select`). Auth, session, token, OAuth, plugin-storage and user tables get
-- neither a grant nor a policy, so they are denied twice (no privilege; RLS would hide the rows anyway).

\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'growgen_ci_readonly') then
    create role growgen_ci_readonly;
  end if;
end
$$;

alter role growgen_ci_readonly with
  login noinherit nocreatedb nocreaterole nobypassrls
  connection limit 4;

alter role growgen_ci_readonly set default_transaction_read_only = on;
alter role growgen_ci_readonly set statement_timeout = '5min';
alter role growgen_ci_readonly set idle_in_transaction_session_timeout = '2min';

revoke all on database postgres from growgen_ci_readonly;
grant connect on database postgres to growgen_ci_readonly;

do $$
declare
  ci_tables text[] := array[
    -- EmDash schema and runtime state the prerender needs
    '_emdash_collections', '_emdash_fields', '_emdash_migrations', '_emdash_migrations_lock', 'options', '_plugin_state',
    '_emdash_redirect_state', '_emdash_redirect_artifacts', '_emdash_redirect_generation_artifacts',
    -- content joined by the prerender and derive
    '_emdash_bylines', '_emdash_content_bylines', 'taxonomies', 'content_taxonomies', 'media'
  ];
  s text;
  t record;
begin
  -- 1. Start from nothing (also removes the grants and default privileges of the earlier broad version of this script).
  foreach s in array array['public', 'derived'] loop
    if exists (select 1 from information_schema.schemata where schema_name = s) then
      execute format('revoke all on all tables in schema %I from growgen_ci_readonly', s);
      execute format('revoke all on all sequences in schema %I from growgen_ci_readonly', s);
      execute format('revoke create on schema %I from growgen_ci_readonly', s);
      execute format('alter default privileges for role postgres in schema %I revoke all on tables from growgen_ci_readonly', s);
      execute format('alter default privileges for role postgres in schema %I revoke all on sequences from growgen_ci_readonly', s);
      execute format('grant usage on schema %I to growgen_ci_readonly', s);
    end if;
  end loop;
  for t in select schemaname, tablename from pg_policies where policyname = 'growgen_ci_readonly_select' loop
    execute format('drop policy growgen_ci_readonly_select on %I.%I', t.schemaname, t.tablename);
  end loop;

  -- 2. Grant SELECT + a SELECT-only RLS policy on exactly the measured set.
  for t in
    select schemaname, tablename from pg_tables
    where (schemaname = 'public' and (tablename = any(ci_tables) or tablename ~ '^ec_[a-z0-9_]+$'))
       or schemaname = 'derived'
  loop
    execute format('grant select on %I.%I to growgen_ci_readonly', t.schemaname, t.tablename);
    execute format('create policy growgen_ci_readonly_select on %I.%I for select to growgen_ci_readonly using (true)', t.schemaname, t.tablename);
  end loop;
end
$$;

-- Verification (expect: t | f | f | f | t | f | f | f | f). db_temp is the default PUBLIC grant of every Postgres database
-- (session-private temp tables only).
select
  r.rolcanlogin as can_login,
  r.rolbypassrls as bypass_rls,
  r.rolsuper as superuser,
  has_database_privilege('growgen_ci_readonly', 'postgres', 'CREATE') as db_create,
  has_database_privilege('growgen_ci_readonly', 'postgres', 'TEMP') as db_temp,
  has_schema_privilege('growgen_ci_readonly', 'public', 'CREATE') as public_create,
  has_table_privilege('growgen_ci_readonly', 'public.users', 'SELECT') as reads_users,
  has_table_privilege('growgen_ci_readonly', 'public.auth_tokens', 'SELECT') as reads_auth_tokens,
  has_table_privilege('growgen_ci_readonly', 'public._emdash_api_tokens', 'SELECT') as reads_api_tokens
from pg_roles r
where r.rolname = 'growgen_ci_readonly';
