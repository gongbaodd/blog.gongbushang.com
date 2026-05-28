export function easeOutSine(t, b, c, d) {
  return c * Math.sin((t / d) * (Math.PI / 2)) + b;
}

export function easeOutQuad(t, b, c, d) {
  t /= d;
  return -c * t * (t - 2) + b;
}

export function easeInQuad(t, b, c, d) {
  t /= d;
  return c * t * t + b;
}

export function lerp(start, end, t) {
  return start + (end - start) * t;
}
