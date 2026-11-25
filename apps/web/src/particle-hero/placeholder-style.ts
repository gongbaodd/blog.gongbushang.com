import type { CSSProperties } from "react";

export interface IPlaceholderSource {
  traceUrl?: string;
  /** Blurred Cloudinary rendition, used instead of `traceUrl` when the trace is only a placeholder rect. */
  lqipUrl?: string;
  colorSet?: { bgColor: string; titleColor: string };
}

/** Loading / WebGL-failed background of the hero: real trace, else blurred rendition, over `bgColor`. Undefined when nothing is known. */
export function galleryPlaceholderStyle(galleryImage?: IPlaceholderSource): CSSProperties | undefined {
  if (!galleryImage) return undefined;
  const bg = galleryImage.traceUrl ?? galleryImage.lqipUrl;
  if (!bg && !galleryImage.colorSet?.bgColor) return undefined;
  return {
    backgroundColor: galleryImage.colorSet?.bgColor,
    backgroundImage: bg ? `url(${bg})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}
