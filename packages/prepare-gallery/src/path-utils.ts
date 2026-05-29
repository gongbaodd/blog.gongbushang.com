import path from "node:path";

export function toUnixPath(p: string): string {
  return p.split(path.sep).join("/");
}

export function toGalleryId(relativePath: string): string {
  return toUnixPath(relativePath).replace(/\.json$/, "");
}

export function toTraceSvgBasename(id: string): string {
  return `${id.replaceAll("/", "-")}.svg`;
}
