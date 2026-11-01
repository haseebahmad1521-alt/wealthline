// Where the sun is, from the clock alone: the subsolar point (where it is directly overhead) and Greenwich sidereal
// time (how the stars sit over Earth). NOAA's solar position equations (after Meeus), good to about 0.01° over this
// century, which is far finer than a pixel on the globe. This is what makes the planet's day and night real.

const RAD = Math.PI / 180;
const wrap360 = (d: number) => ((d % 360) + 360) % 360;
const wrap180 = (d: number) => wrap360(d + 180) - 180;

/** Julian day from a Unix time in milliseconds. */
export const julianDay = (ms: number) => ms / 86_400_000 + 2_440_587.5;

export type SubsolarPoint = {
  /** Latitude where the sun is overhead (= solar declination), degrees. */
  lat: number;
  /** Longitude where the sun is overhead, degrees east, -180..180. */
  lng: number;
  /** Equation of time, minutes (apparent minus mean solar time). */
  equationOfTime: number;
};

export function subsolarPoint(ms: number): SubsolarPoint {
  const T = (julianDay(ms) - 2_451_545) / 36_525;
  const L0 = wrap360(280.46646 + T * (36000.76983 + T * 0.0003032));
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C =
    Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * M * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const obliq0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const obliq = obliq0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(obliq * RAD) * Math.sin(lambda * RAD)) / RAD;

  const y = Math.tan((obliq / 2) * RAD) ** 2;
  const eot =
    (4 / RAD) *
    (y * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * y * y * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD));

  const d = new Date(ms);
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60_000;
  // Apparent solar noon is where the sun is overhead: 12:00 local apparent time.
  const lng = wrap180(-(utcMinutes + eot - 720) / 4);
  return { lat: decl, lng, equationOfTime: eot };
}

/** Greenwich mean sidereal time in degrees (0..360): the right ascension on the Greenwich meridian. */
export function greenwichSiderealDeg(ms: number): number {
  const jd = julianDay(ms);
  const T = (jd - 2_451_545) / 36_525;
  return wrap360(280.46061837 + 360.98564736629 * (jd - 2_451_545) + 0.000387933 * T * T - (T * T * T) / 38_710_000);
}

/** Unit vector for a latitude/longitude in Earth-fixed axes: +Y north pole, +Z through (0°, 0°), +X through (0°, 90°E). */
export function latLngToUnit(lat: number, lng: number): [number, number, number] {
  const phi = lat * RAD;
  const lam = lng * RAD;
  return [Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)];
}
