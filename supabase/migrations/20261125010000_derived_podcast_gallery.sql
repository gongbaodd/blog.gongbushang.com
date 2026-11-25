-- MIG-3: derived cache for podcast episodes and gallery images (extends the PORT-8 schema, idempotent).
-- Same rules as 20261125000000_derived_schema.sql: separate schema, never touched by EmDash, dropping it is harmless
-- (the next `pnpm --filter web derive` re-embeds the episodes and re-traces the images, which needs LM Studio and network).
--
-- Apply: `pnpm --filter web derive:migrate` (applies every derived_* migration; any env, via the session pooler).

create schema if not exists derived;
create extension if not exists vector with schema extensions;

-- One row per podcast episode (key = EmDash legacy_id = episode slug). Valid while content_hash (sha256 of the
-- embedding input text: title + summary) and model match. Same shape as post_embeddings.
create table if not exists derived.podcast_embeddings (
  legacy_id    text primary key,
  content_hash text not null,
  model        text not null,
  embedding    extensions.vector(1024) not null,
  updated_at   timestamptz not null default now()
);

-- Gallery trace SVG (sobel edges + potrace) and colour set, keyed by the Cloudinary image URL: the image is the only
-- input. Tracing 75 images from Cloudinary is slow (network + potrace), so the build only traces new URLs.
create table if not exists derived.gallery_traces (
  image_url   text primary key,
  svg         text not null,
  bg_color    text not null,
  title_color text not null,
  updated_at  timestamptz not null default now()
);

alter table derived.podcast_embeddings enable row level security;
alter table derived.gallery_traces     enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema derived from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema derived from authenticated;
  end if;
end $$;
