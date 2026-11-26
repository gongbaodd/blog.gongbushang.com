-- SEC-11 (GON-198): least-privilege, read-only role for the nightly `backup-production` job (.github/workflows/web-guards.yml).
--
-- NOT a migration: it lives outside supabase/migrations so `supabase start` / `db reset` / `db push` never apply it.
-- OWNER-ONLY, once per cloud project, by hand, as `postgres` (docs/plan/emdash/runbooks/backups.md "Least-privilege backup
-- role"). Idempotent, and it contains no password: set one afterwards with psql's `\password growgen_backup`, which hashes
-- client-side so the cleartext never reaches argv or the server log.
--
--   psql "$SUPABASE_PRODUCTION_POOLER_URL" -v ON_ERROR_STOP=1 -f supabase/roles/growgen_backup.sql
--   psql "$SUPABASE_PRODUCTION_POOLER_URL" -c '\password growgen_backup'
--
-- Why BYPASSRLS: SEC-01 enables RLS (no policies) on every public.* table and pg_dump runs with row_security=off, so a role
-- without BYPASSRLS errors out instead of dumping. The role still has no write, DDL, CREATE or TEMP privilege, and every
-- session defaults to a read-only transaction. Supabase's `postgres` has BYPASSRLS, so it may grant it.

\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'growgen_backup') then
    create role growgen_backup;
  end if;
end
$$;

alter role growgen_backup with
  login noinherit nocreatedb nocreaterole bypassrls
  connection limit 3;

alter role growgen_backup set default_transaction_read_only = on;
alter role growgen_backup set statement_timeout = '15min';
alter role growgen_backup set idle_in_transaction_session_timeout = '5min';

-- Connect + read only. No CREATE on the database or schemas.
revoke all on database postgres from growgen_backup;
grant connect on database postgres to growgen_backup;

do $$
declare
  s text;
begin
  foreach s in array array['public', 'derived'] loop
    if exists (select 1 from information_schema.schemata where schema_name = s) then
      execute format('revoke create on schema %I from growgen_backup', s);
      execute format('grant usage on schema %I to growgen_backup', s);
      execute format('grant select on all tables in schema %I to growgen_backup', s);
      execute format('grant select on all sequences in schema %I to growgen_backup', s);
      -- Tables EmDash / derive migrations create later (owned by postgres) stay readable for the backup.
      execute format('alter default privileges for role postgres in schema %I grant select on tables to growgen_backup', s);
      execute format('alter default privileges for role postgres in schema %I grant select on sequences to growgen_backup', s);
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
  has_database_privilege('growgen_backup', 'postgres', 'CREATE') as db_create,
  has_database_privilege('growgen_backup', 'postgres', 'TEMP') as db_temp,
  has_schema_privilege('growgen_backup', 'public', 'CREATE') as public_create
from pg_roles r
where r.rolname = 'growgen_backup';
