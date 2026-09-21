import fs from "node:fs";
import path from "node:path";
import type { APIRoute, GetStaticPaths } from "astro";
import { GALLERY_TRACE_DIR } from "@/packages/consts/config.js";
import { listGalleryTraceFiles } from "@/packages/utils/gallery";

export const prerender = true;

export const getStaticPaths = (() => {
  return listGalleryTraceFiles().map((file) => ({
    params: { file },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const file = `${params.file}.svg`;
  if (!/^[\w-]+\.svg$/.test(file)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const svgPath = path.join(process.cwd(), GALLERY_TRACE_DIR, file);
    if (!fs.existsSync(svgPath)) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(fs.readFileSync(svgPath, "utf-8"), {
      headers: { "Content-Type": "image/svg+xml" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
};
