-- SEC-11 (GON-198): SELECT-only role for pull-request CI (`web-ci`, GitHub environment `ci-readonly`, secret
-- DATABASE_POOLER_URL). PR builds read the production database (INF-10) for `emdash migrate --check`, EmDash's prerender and
-- `derive` with DERIVE_READONLY=1; with this role a stray write fails in Postgres instead of being merely discouraged.
--
-- NOT a migration (never applied by `supabase start` / `db push`). OWNER-ONLY, once, by hand, as `postgres`
-- (docs/plan/emdash/runbooks/ci.md "Read-only CI role"). Idempotent, no password inside:
--
--   psql "$SUPABASE_PRODUCTION_POOLER_URL" -v ON_ERROR_STOP=1 -f supabase/roles/growgen_ci_readonly.sql
--   psql "$SUPABASE_PRODUCTION_POOLER_URL" -c '\password growgen_ci_readonly'
--
-- Then the ci-readonly secret DATABASE_POOLER_URL becomes
--   postgresql://growgen_ci_readonly.<project-ref>:<password>@<pooler-host>:5432/postgres   (session pooler, IPv4)
--
-- Why BYPASSRLS (and not read policies on derived.*): SEC-01 turned RLS on, with no policies, for every public.* EmDash table,
-- so without it EmDash's prerender would see empty tables and build an empty site (and derive an empty cache). Read policies
-- would have to be added to every EmDash table, including ones future EmDash versions create. BYPASSRLS on a role that can
-- only SELECT is the smaller surface. It can read auth tables (users, credentials, tokens) like the owner can; the gain is
-- that it cannot write, DDL, or create objects, and it holds no production deploy token (that stays in `production`).

\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'growgen_ci_readonly') then
    create role growgen_ci_readonly;
  end if;
end
$$;

alter role growgen_ci_readonly with
  login noinherit nocreatedb nocreaterole bypassrls
  connection limit 4;

alter role growgen_ci_readonly set default_transaction_read_only = on;
alter role growgen_ci_readonly set statement_timeout = '5min';
alter role growgen_ci_readonly set idle_in_transaction_session_timeout = '2min';

revoke all on database postgres from growgen_ci_readonly;
grant connect on database postgres to growgen_ci_readonly;

do $$
declare
  s text;
begin
  foreach s in array array['public', 'derived'] loop
    if exists (select 1 from information_schema.schemata where schema_name = s) then
      execute format('revoke create on schema %I from growgen_ci_readonly', s);
      execute format('grant usage on schema %I to growgen_ci_readonly', s);
      execute format('grant select on all tables in schema %I to growgen_ci_readonly', s);
      execute format('grant select on all sequences in schema %I to growgen_ci_readonly', s);
      execute format('alter default privileges for role postgres in schema %I grant select on tables to growgen_ci_readonly', s);
      execute format('alter default privileges for role postgres in schema %I grant select on sequences to growgen_ci_readonly', s);
    end if;
  end loop;
end
$$;

-- Verification (expect: t | t | f | f | t | f; db_temp is the default PUBLIC grant of every Postgres database: temp tables
-- are session-private and cannot change persistent data).
select
  r.rolcanlogin as can_login,
  r.rolbypassrls as bypass_rls,
  r.rolsuper as superuser,
  has_database_privilege('growgen_ci_readonly', 'postgres', 'CREATE') as db_create,
  has_database_privilege('growgen_ci_readonly', 'postgres', 'TEMP') as db_temp,
  has_schema_privilege('growgen_ci_readonly', 'public', 'CREATE') as public_create
from pg_roles r
where r.rolname = 'growgen_ci_readonly';
