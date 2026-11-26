-- SEC-11 (GON-198): run AS growgen_ci_readonly (its own session-pooler URL, the ci-readonly DATABASE_POOLER_URL) after
-- applying growgen_ci_readonly.sql. Read-only; raises (non-zero psql exit) on the first leak, prints "ci-readonly ok" otherwise.
--
--   psql "$CI_READONLY_URL" -v ON_ERROR_STOP=1 -f supabase/roles/check_ci_readonly.sql

\set ON_ERROR_STOP on

do $$
declare
  n bigint;
  t text;
begin
  if current_user <> 'growgen_ci_readonly' then
    raise exception 'run this as growgen_ci_readonly, not %', current_user;
  end if;

  -- 1. Secret rows of `options` are invisible (RLS allow-list on name).
  select count(*) into n from public.options
  where name in ('emdash:preview_secret', 'emdash:ip_salt', 'emdash:setup_state')
     or starts_with(name, 'emdash:passkey_pending:')
     or starts_with(name, 'plugin:');
  if n > 0 then
    raise exception 'growgen_ci_readonly can see % secret options row(s)', n;
  end if;
  select count(*) into n from public.options
  where not (starts_with(name, 'site:') or name = any(array[
    'byline_fields_version', 'emdash:plugins:generation', 'emdash:site_title', 'emdash:site_url', 'emdash:locale',
    'emdash:repair_locale_casing', 'emdash:seed_complete', 'emdash:setup_complete',
    'emdash:exclusive_hook:comment:moderate', 'emdash:exclusive_hook:email:deliver']));
  if n > 0 then
    raise exception 'growgen_ci_readonly can see % options row(s) outside the allow-list', n;
  end if;

  -- 2. Auth, session, token, OAuth, plugin-storage and log tables are not readable at all.
  foreach t in array array['users', 'credentials', 'oauth_accounts', 'auth_tokens', 'auth_challenges', '_emdash_api_tokens',
    '_emdash_oauth_tokens', '_emdash_authorization_codes', '_emdash_device_codes', '_emdash_entry_locks',
    '_emdash_transfer_approvals', '_plugin_storage', 'audit_logs', 'allowed_domains'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'growgen_ci_readonly can read public.%', t;
    exception when insufficient_privilege then
      null;
    end;
  end loop;

  -- 3. Content the build needs is readable.
  if to_regclass('public.ec_posts') is not null then
    execute 'select count(*) from public.ec_posts' into n;
    raise notice 'ec_posts visible rows: %', n;
  end if;
end
$$;

select 'ci-readonly ok' as result;
