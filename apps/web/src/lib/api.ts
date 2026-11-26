// Response helpers for the prerendered JSON/NDJSON API routes (legacy src/pages/api/**).
import type { ListEntry } from "./listing";
import { toClients } from "./listing";

export const ndjson = (lines: unknown[]) =>
  new Response(lines.map((l) => JSON.stringify(l)).join("\n"), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
    status: 200,
  });

export const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });

/** One NDJSON page of client posts (legacy `[page].ndjson` routes). */
export async function ndjsonPage(posts: ListEntry[]) {
  return ndjson(await toClients(posts));
}
