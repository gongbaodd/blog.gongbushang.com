import path from "node:path";

export function toUnixPath(p: string): string {
  return p.split(path.sep).join("/");
}

export function toMetadataSlug(relativePath: string): string {
  return toUnixPath(relativePath)
    .replace(/\.md$/, "")
    .toLowerCase()
    .replace(/[^\w/-]+/g, "")
    .replace(/\/+/g, "/")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}
