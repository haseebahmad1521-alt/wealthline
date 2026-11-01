/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { greenwichSiderealDeg, latLngToUnit, subsolarPoint } from './sun.ts';

const near = (actual: number, expected: number, tol: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} not within ${tol} of ${expected}`);

// 2026 equinox and solstices (USNO / timeanddate): the sun crosses the equator or reaches the tropics.
test('declination at the 2026 March equinox is ~0°', () => {
  near(subsolarPoint(Date.UTC(2026, 2, 20, 14, 46)).lat, 0, 0.05, 'lat');
});
test('declination at the 2026 June solstice is the Tropic of Cancer', () => {
  near(subsolarPoint(Date.UTC(2026, 5, 21, 8, 24)).lat, 23.436, 0.02, 'lat');
});
test('declination at the 2026 December solstice is the Tropic of Capricorn', () => {
  near(subsolarPoint(Date.UTC(2026, 11, 21, 20, 50)).lat, -23.436, 0.02, 'lat');
});

test('equation of time: early November is about +16.4 min, mid-February about -14.2 min', () => {
  near(subsolarPoint(Date.UTC(2026, 10, 3, 12)).equationOfTime, 16.4, 0.3, 'Nov 3');
  near(subsolarPoint(Date.UTC(2026, 1, 11, 12)).equationOfTime, -14.2, 0.3, 'Feb 11');
});

test('subsolar longitude: noon UTC is just west of Greenwich in November, and moves 15° west an hour', () => {
  const noon = subsolarPoint(Date.UTC(2026, 10, 3, 12)).lng;
  near(noon, -16.4 / 4, 0.1, 'noon');
  near(subsolarPoint(Date.UTC(2026, 10, 3, 13)).lng, noon - 15, 0.05, '+1h');
  // Wraps across the date line instead of running past -180.
  near(subsolarPoint(Date.UTC(2026, 10, 4, 0)).lng, 180 - 16.4 / 4, 0.2, 'midnight');
});

test('Greenwich sidereal time at the J2000 epoch is 280.46°', () => {
  near(greenwichSiderealDeg(Date.UTC(2000, 0, 1, 12)), 280.46062, 0.001, 'GMST');
});

test('lat/lng to unit vector uses +Y north, +Z through 0°/0°, +X through 90°E', () => {
  const [x, y, z] = latLngToUnit(0, 90);
  near(x, 1, 1e-9, 'x');
  near(y, 0, 1e-9, 'y');
  near(z, 0, 1e-9, 'z');
  near(latLngToUnit(90, 0)[1], 1, 1e-9, 'north');
});
