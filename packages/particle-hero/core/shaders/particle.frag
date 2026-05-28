precision highp float;

uniform sampler2D uTexture;
uniform float uDataMode;
uniform float uContrast;

varying vec2 vPUv;
varying vec2 vUv;
varying vec3 vColor;

void main() {
  vec4 color = vec4(0.0);
  vec2 uv = vUv;
  vec2 puv = vPUv;

  vec4 colA = texture2D(uTexture, puv);

  float border = 0.3;
  float radius = 0.5;
  float dist = radius - distance(uv, vec2(0.5));
  float t = smoothstep(0.0, border, dist);

  if (uDataMode > 0.5) {
    color = vec4(vColor, 1.0);
  } else {
    color = colA;
    float g = dot(colA.rgb, vec3(0.299, 0.587, 0.114));
    float gSoft = clamp((g - 0.5) * uContrast + 0.5, 0.0, 1.0);
    float lift = gSoft / max(g, 0.001);
    color.rgb = clamp(colA.rgb * lift, 0.0, 1.0);
  }
  color.a = t * color.a;

  gl_FragColor = color;
}
