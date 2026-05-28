precision highp float;

varying vec2 vUv;

void main() {
  float border = 0.35;
  float radius = 0.5;
  float dist = radius - distance(vUv, vec2(0.5));
  float alpha = smoothstep(0.0, border, dist) * 0.4;

  gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
}
