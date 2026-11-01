// GLSL for the planet scene. Units: Earth radius = 1, world axes Earth-fixed (+Y north, +Z through 0°/0°, +X through
// 90°E; see src/lib/sun.ts). The atmosphere is drawn about six times thicker than life so its glow reads at this scale,
// with scattering coefficients scaled down to match. Everything here is presentation: the only data is the sun
// direction, computed from the clock.

const finish = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

export const worldVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPosW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

export const earthFragment = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D oceanMap;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    float ndl = dot(N, sunDir);
    float dayW = smoothstep(-0.10, 0.22, ndl);

    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 lights = texture2D(nightMap, vUv).rgb;
    float ocean = texture2D(oceanMap, vUv).r;

    vec3 lit = day * (0.035 + 1.3 * max(ndl, 0.0));

    // Night side: stylized, never black. A cool moonlit floor that keeps continents legible, plus warm city lights
    // that are strongest just past the terminator (early evening) and settle a little deeper into the night.
    vec3 floorCol = day * vec3(0.11, 0.14, 0.24) + vec3(0.004, 0.008, 0.018);
    float l = dot(lights, vec3(0.2126, 0.7152, 0.0722));
    vec3 city = vec3(1.0, 0.70, 0.36) * pow(l, 1.35) * 2.4 * (0.72 + 0.28 * smoothstep(-0.5, -0.04, ndl));
    vec3 col = mix(floorCol + city, lit, dayW);

    // Sun glint on open water.
    vec3 H = normalize(sunDir + V);
    col += vec3(1.0, 0.91, 0.76) * pow(max(dot(N, H), 0.0), 90.0) * ocean * smoothstep(0.0, 0.25, ndl) * 0.85;

    // Warm band along the terminator, where sunlight crosses the most air.
    col += vec3(1.0, 0.40, 0.14) * exp(-pow(ndl / 0.07, 2.0)) * 0.09 * (0.35 + day);

    // Beer–Lambert extinction toward the limb: surface light crossing more air loses blue first.
    float mu = max(dot(N, V), 0.0);
    col *= exp(-vec3(0.018, 0.042, 0.095) / (mu + 0.12));

    // Rim light: strong blue on the day side, a faint cool line on the night side.
    float fres = pow(1.0 - mu, 4.0);
    col += vec3(0.34, 0.58, 1.0) * fres * (0.08 + 0.95 * smoothstep(-0.25, 0.5, ndl));

    gl_FragColor = vec4(col, 1.0);
    ${finish}
  }
`;

/** Single scattering through the shell (after O'Neil / Nishita), additive over Earth and space. */
export const atmosphereFragment = /* glsl */ `
  uniform vec3 sunDir;
  uniform float Rp;
  uniform float Ra;
  uniform float HR;
  uniform float HM;
  uniform vec3 betaR;
  uniform float betaM;
  uniform float sunI;
  uniform float g;
  varying vec3 vPosW;

  vec2 raySphere(vec3 o, vec3 d, float r) {
    float b = dot(o, d);
    float c = dot(o, o) - r * r;
    float h = b * b - c;
    if (h < 0.0) return vec2(1e5, -1e5);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
  }

  void main() {
    vec3 o = cameraPosition;
    vec3 d = normalize(vPosW - o);
    vec2 ta = raySphere(o, d, Ra);
    if (ta.x > ta.y) discard;
    vec2 tp = raySphere(o, d, Rp);
    float t0 = max(ta.x, 0.0);
    float t1 = ta.y;
    if (tp.x < tp.y && tp.x > 0.0) t1 = tp.x;

    const int N = 10;
    const int M = 4;
    float ds = (t1 - t0) / float(N);
    vec3 sumR = vec3(0.0);
    vec3 sumM = vec3(0.0);
    float odR = 0.0;
    float odM = 0.0;
    for (int i = 0; i < N; i++) {
      vec3 p = o + d * (t0 + ds * (float(i) + 0.5));
      float h = length(p) - Rp;
      float dR = exp(-h / HR) * ds;
      float dM = exp(-h / HM) * ds;
      odR += dR;
      odM += dM;
      // Earth's shadow: air behind Earth (as seen from the sun) and within its radius of the sun axis, softened
      // just inside the edge so the lit/unlit boundary in the air is continuous.
      float sb = dot(p, sunDir);
      float lit = sb > 0.0 ? 1.0 : smoothstep(Rp - 0.012, Rp, length(p - sunDir * sb));
      if (lit <= 0.0) continue;
      float dsl = raySphere(p, sunDir, Ra).y / float(M);
      float lR = 0.0;
      float lM = 0.0;
      for (int j = 0; j < M; j++) {
        float hq = length(p + sunDir * (dsl * (float(j) + 0.5))) - Rp;
        lR += exp(-hq / HR) * dsl;
        lM += exp(-hq / HM) * dsl;
      }
      vec3 att = exp(-(betaR * (odR + lR) + betaM * 1.1 * (odM + lM)));
      sumR += dR * att * lit;
      sumM += dM * att * lit;
    }
    float mu = dot(d, sunDir);
    float pR = 0.0597 * (1.0 + mu * mu);
    float g2 = g * g;
    float pM = 0.1194 * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5));
    vec3 col = sunI * (sumR * betaR * pR + sumM * betaM * pM);
    // Faint airglow so the night-side limb never disappears (stylized). Only at the limb: looking straight down
    // through the air over the night side must stay dark.
    float limb = 1.0 - abs(dot(d, normalize(o + d * t0)));
    col += vec3(0.02, 0.05, 0.12) * (1.0 - exp(-odR * 30.0)) * pow(limb, 6.0);
    gl_FragColor = vec4(col, 1.0);
    ${finish}
  }
`;

/** Stars (NASA SVS Deep Star Maps, celestial coordinates) behind a horizon haze that thickens near Earth. */
export const skyFragment = /* glsl */ `
  uniform sampler2D starMap;
  uniform float gmst;      // radians: the right ascension on the Greenwich meridian
  uniform float haze;      // optical depth of the haze at the horizon (grows as the camera descends)
  uniform float starGain;
  uniform vec3 sunDir;
  varying vec3 vPosW;
  const float PI = 3.141592653589793;

  void main() {
    vec3 d = normalize(vPosW - cameraPosition);
    float lon = atan(d.x, d.z);
    float lat = asin(clamp(d.y, -1.0, 1.0));
    float ra = lon + gmst;
    // The map has RA 0h at its centre, increasing to the left.
    vec2 uv = vec2(fract(0.5 - ra / (2.0 * PI)), 0.5 + lat / PI);
    // A gentle power keeps faint background stars down so the bright ones read as crisp points.
    vec3 stars = pow(texture2D(starMap, uv).rgb, vec3(1.25)) * starGain;

    // How close this line of sight passes to Earth: the closer to the limb, the more air it crosses.
    vec3 o = cameraPosition;
    float b = dot(o, d);
    float h = b < 0.0 ? length(o - d * b) - 1.0 : length(o) - 1.0;
    // Thin layer: only lines of sight that skim the limb pick up haze; the sky overhead stays black and starry.
    float tau = haze * exp(-max(h, 0.0) / 0.07);
    vec3 T = exp(-tau * vec3(0.55, 0.78, 1.0));
    float sunSide = 0.3 + 0.7 * (dot(d, sunDir) * 0.5 + 0.5);
    vec3 col = stars * T + vec3(0.22, 0.42, 0.90) * sunSide * (1.0 - T.b) * 0.38;
    gl_FragColor = vec4(col, 1.0);
    ${finish}
  }
`;

/** A soft sun: a hot core and a wide halo, drawn on a camera-facing quad far away. */
export const sunFragment = /* glsl */ `
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float core = exp(-r * r * 900.0) * 14.0;
    float glow = exp(-r * r * 60.0) * 1.2 + exp(-r * 5.0) * 0.32;
    vec3 col = vec3(1.0, 0.93, 0.82) * (core + glow) * smoothstep(1.0, 0.7, r);
    gl_FragColor = vec4(col, 1.0);
    ${finish}
  }
`;

export const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
