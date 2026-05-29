export const PARTICLE_LAYOUT_LANDSCAPE = { width: 320, height: 180 } as const;
export const PARTICLE_LAYOUT_SQUARE = { width: 180, height: 180 } as const;

export const PARTICLE_LAYOUT_BELOW_LARGE_MQ = "(max-width: 61.99em)";

export type ParticleLayoutMode = "landscape" | "square";

export function getParticleLayoutDims(mode: ParticleLayoutMode) {
  return mode === "square" ? PARTICLE_LAYOUT_SQUARE : PARTICLE_LAYOUT_LANDSCAPE;
}

export function getParticleLayoutModeForViewport(): ParticleLayoutMode {
  if (typeof window === "undefined") return "landscape";
  return window.matchMedia(PARTICLE_LAYOUT_BELOW_LARGE_MQ).matches
    ? "square"
    : "landscape";
}

/** Center-crop source image into target (object-fit: cover). */
export function drawImageCoverCenter(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  targetW: number,
  targetH: number,
) {
  const srcW = img.width;
  const srcH = img.height;
  const srcAspect = srcW / srcH;
  const dstAspect = targetW / targetH;

  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;

  if (srcAspect > dstAspect) {
    sh = srcH;
    sw = sh * dstAspect;
    sx = (srcW - sw) / 2;
  } else if (srcAspect < dstAspect) {
    sw = srcW;
    sh = sw / dstAspect;
    sy = (srcH - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
}
