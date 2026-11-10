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
  uniform float nightLift; // 0 … 1: brightens the night side as the camera zooms in close (a cheap HDR feel)
  uniform sampler2D fillMap; // countries shaded by World (Economies, What if); alpha 0 where nothing is shaded
  uniform float fillMix; // 0 … 1: how far the camera has swung into the World view
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
    vec3 floorCol = (day * vec3(0.11, 0.14, 0.24) + vec3(0.004, 0.008, 0.018)) * (1.0 + 1.6 * nightLift);
    float l = dot(lights, vec3(0.2126, 0.7152, 0.0722));
    vec3 city = vec3(1.0, 0.70, 0.36) * pow(l, 1.35) * 2.4 * (0.72 + 0.28 * smoothstep(-0.5, -0.04, ndl));
    vec3 col = mix(floorCol + city, lit, dayW);

    // World's country shading sits on the surface, equally readable by day and night (a figure, not light).
    vec4 fill = texture2D(fillMap, vUv);
    col = mix(col, fill.rgb, fill.a * fillMix);

    // Sun glint on open water.
    vec3 H = normalize(sunDir + V);
    col += vec3(1.0, 0.91, 0.76) * pow(max(dot(N, H), 0.0), 90.0) * ocean * smoothstep(0.0, 0.25, ndl) * 0.85;

    // Warm tint along the terminator, where sunlight crosses the most air. Scaled by the ground's own colour: a flat
    // added glow read as a pale stripe down the globe whenever the terminator faced the camera edge-on.
    col += vec3(1.0, 0.40, 0.14) * exp(-pow(ndl / 0.06, 2.0)) * 0.12 * day;

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

    // 8 view samples × 3 light samples: visually the same glow as 10 × 4 at about half the cost.
    const int N = 8;
    const int M = 3;
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

// What the air does to light from the sky along view direction d, seen from o: `starK` multiplies starlight (haze
// extinction near the limb; inside the atmosphere, the blue glow drowns all but the stars high overhead) and `glow` is
// the light the air itself adds. Shared by the sky (Milky Way glow) and the star points so both fade alike.
const skyAir = /* glsl */ `
  uniform float haze;      // optical depth of the haze at the horizon (grows as the camera descends)
  uniform float air;       // 0 … 1: sky glow seen from inside the atmosphere (Projects' rocket); 0 elsewhere
  uniform vec3 sunDir;

  void skyAir(vec3 o, vec3 d, out vec3 starK, out vec3 glow) {
    // How close this line of sight passes to Earth: the closer to the limb, the more air it crosses.
    float b = dot(o, d);
    float h = b < 0.0 ? length(o - d * b) - 1.0 : length(o) - 1.0;
    // Thin layer: only lines of sight that skim the limb pick up haze; the sky overhead stays black and starry.
    float tau = haze * exp(-max(h, 0.0) / 0.07);
    vec3 T = exp(-tau * vec3(0.55, 0.78, 1.0));
    float sunSide = 0.3 + 0.7 * (dot(d, sunDir) * 0.5 + 0.5);
    starK = T;
    glow = vec3(0.22, 0.42, 0.90) * sunSide * (1.0 - T.b) * 0.38;
    // From inside the thin upper air: bright blue at the horizon, thinning with elevation to black and faint stars
    // overhead. g is the height above the visible horizon (0 at the horizon, about 0.4 at the top of the view).
    if (air > 0.0) {
      float camH = length(o) - 1.0;
      float dip = sqrt(max(1.0 - 1.0 / dot(o, o), 0.0));
      float g = max(dot(d, normalize(o)) + dip, 0.0);
      float day = smoothstep(-0.25, 0.25, dot(normalize(o), sunDir));
      float a = air * exp(-g * 5.5) * exp(-camH / 0.06);
      vec3 blue = mix(vec3(0.55, 0.78, 1.0), vec3(0.12, 0.32, 0.85), smoothstep(0.0, 0.35, g));
      // Stars only start to show in the top part of the view, where the air has thinned out.
      float k = mix(1.0, smoothstep(0.26, 0.46, g), air) * (1.0 - a * 0.95);
      starK *= k;
      glow = glow * k + blue * a * mix(0.12, 1.15, day) * (0.75 + 0.25 * sunSide);
    }
  }
`;

/** The sky: the Milky Way (NASA SVS Deep Star Maps, celestial coordinates) as a glow (point stars removed; they are drawn as points), haze and air. */
export const skyFragment = /* glsl */ `
  uniform sampler2D milkyWay;
  uniform float gmst;      // radians: the right ascension on the Greenwich meridian
  uniform float glowGain;
  varying vec3 vPosW;
  const float PI = 3.141592653589793;
  ${skyAir}

  void main() {
    vec3 d = normalize(vPosW - cameraPosition);
    float lon = atan(d.x, d.z);
    float lat = asin(clamp(d.y, -1.0, 1.0));
    float ra = lon + gmst;
    // The map has RA 0h at its centre, increasing to the left.
    vec2 uv = vec2(fract(0.5 - ra / (2.0 * PI)), 0.5 + lat / PI);
    vec3 starK, glow;
    skyAir(cameraPosition, d, starK, glow);
    gl_FragColor = vec4(texture2D(milkyWay, uv).rgb * glowGain * starK + glow, 1.0);
    ${finish}
  }
`;

/**
 * Stars as points (Yale Bright Star Catalogue, to about magnitude 8): the geometry is in celestial coordinates and
 * the Points object turns with sidereal time and rides on the camera. Size and brightness come from the V magnitude,
 * colour from B−V. Faint stars stay at least 2 device pixels wide (dimmer instead of smaller) so nothing shimmers.
 */
export const starVertex = /* glsl */ `
  attribute float mag;
  attribute float bv;
  uniform float pxRatio;
  uniform float starGain;
  varying vec3 vCol;
  varying float vSize;
  ${skyAir}

  vec3 bvColor(float c) {
    vec3 col = mix(vec3(0.66, 0.75, 1.0), vec3(0.85, 0.9, 1.0), smoothstep(-0.3, 0.0, c));
    col = mix(col, vec3(1.0, 0.97, 0.92), smoothstep(0.0, 0.6, c));
    col = mix(col, vec3(1.0, 0.86, 0.68), smoothstep(0.6, 1.1, c));
    return mix(col, vec3(1.0, 0.74, 0.5), smoothstep(1.1, 1.7, c));
  }

  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vec3 starK, glow;
    skyAir(cameraPosition, normalize(w.xyz - cameraPosition), starK, glow);
    float b = pow(10.0, -0.4 * (mag - 6.5)); // flux relative to a naked-eye-limit star
    float size = clamp(1.3 * pow(b, 0.2), 1.0, 6.0) * pxRatio;
    float peak = clamp(0.25 * pow(b, 0.4), 0.0, 2.5);
    float shown = max(size, 2.0);
    peak *= (size * size) / (shown * shown); // same light spread over the minimum footprint
    gl_PointSize = shown;
    vSize = shown;
    vCol = bvColor(bv) * peak * starGain * starK;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

export const starFragment = /* glsl */ `
  varying vec3 vCol;
  varying float vSize;
  void main() {
    // Gaussian in device pixels: a 2 px point never samples its own centre, so its width can't scale with the size.
    float r = length(gl_PointCoord - 0.5) * vSize;
    float sigma = max(0.7, vSize * 0.22);
    float f = exp(-r * r / (2.0 * sigma * sigma));
    if (f < 0.02) discard;
    gl_FragColor = vec4(vCol * f, 1.0);
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
