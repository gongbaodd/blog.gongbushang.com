-- PORT-8: build-time derived-data cache (embeddings, cover colours, geocodes, UMAP layout).
-- Separate schema, never touched by EmDash. Idempotent: safe to run on local, testing and production.
-- The cache only holds values the build can recompute from the CMS content; dropping the schema is harmless
-- (the next `pnpm --filter web derive` re-embeds everything, which needs the local embedding model).
--
-- Apply: `pnpm --filter web derive:migrate` (any env, via the session pooler) or `supabase db push`.
-- See docs/plan/emdash/runbooks/data.md.

create schema if not exists derived;
create extension if not exists vector with schema extensions;

-- One row per post. A row is valid only while content_hash (sha256 of the embedding input text) and model match.
create table if not exists derived.post_embeddings (
  legacy_id    text primary key,
  content_hash text not null,
  model        text not null,
  embedding    extensions.vector(1024) not null,
  updated_at   timestamptz not null default now()
);

-- Cover colours keyed by cover URL (the image is the input, so no post id and no hash are needed).
create table if not exists derived.cover_colors (
  cover_url   text primary key,
  bg_color    text not null,
  title_color text not null,
  updated_at  timestamptz not null default now()
);

-- Geocoded city strings (Google Geocoding), keyed by the exact city label.
create table if not exists derived.geocodes (
  city       text primary key,
  latitude   double precision not null,
  longitude  double precision not null,
  updated_at timestamptz not null default now()
);

-- EmDash keeps no per-entry term order; the legacy frontmatter order is part of the embedding text and of the
-- rendered tag list, so the first-seen order is pinned here.
create table if not exists derived.post_hints (
  legacy_id  text primary key,
  tag_order  text[] not null default '{}',
  city_order text[] not null default '{}',
  -- Cover the legacy frontmatter had but EmDash does not carry yet (external/local cover images until MIG-2 rehosts them).
  -- Ignored once the post has a featured_image.
  cover      jsonb,
  updated_at timestamptz not null default now()
);
alter table derived.post_hints add column if not exists cover jsonb;

-- The 2D UMAP layout for the whole corpus (posts + podcast episodes). Reused while the input hash is unchanged.
create table if not exists derived.umap_state (
  id           text primary key default 'blog',
  input_hash   text not null,
  params_hash  text not null,
  count        integer not null,
  coordinates  jsonb not null,
  updated_at   timestamptz not null default now()
);

-- Not exposed through Supabase's API: RLS on with no policies (the owner role used by the build bypasses it).
alter table derived.post_embeddings enable row level security;
alter table derived.cover_colors    enable row level security;
alter table derived.geocodes        enable row level security;
alter table derived.post_hints      enable row level security;
alter table derived.umap_state      enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on schema derived from anon;
    revoke all on all tables in schema derived from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on schema derived from authenticated;
    revoke all on all tables in schema derived from authenticated;
  end if;
end $$;
