// Country shapes and anchor points for the World globe. Shapes: Natural Earth 1:110m via world-atlas (ISC).
import { geoCentroid } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

const topology = require('world-atlas/countries-110m.json') as Topology;
export const land = feature(topology, topology.objects.countries as GeometryCollection) as FeatureCollection<Geometry, { name: string }>;

export type LatLng = { lat: number; lng: number };

const regionName = new Intl.DisplayNames(['en'], { type: 'region' });
// Where Natural Earth's short names differ from the standard English names.
const ATLAS_NAME: Record<string, string> = {
  US: 'United States of America', CD: 'Dem. Rep. Congo', CF: 'Central African Rep.', DO: 'Dominican Rep.', BA: 'Bosnia and Herz.',
  SS: 'S. Sudan', GQ: 'Eq. Guinea', CZ: 'Czechia', KR: 'South Korea', KP: 'North Korea', CI: "Côte d'Ivoire", SZ: 'eSwatini',
  MK: 'Macedonia', SB: 'Solomon Is.', FK: 'Falkland Is.', TF: 'Fr. S. Antarctic Lands', EH: 'W. Sahara', PS: 'Palestine',
  MM: 'Myanmar', LA: 'Laos', VN: 'Vietnam', RU: 'Russia', IR: 'Iran', SY: 'Syria', TZ: 'Tanzania', BO: 'Bolivia', VE: 'Venezuela',
  MD: 'Moldova', BN: 'Brunei', CY: 'Cyprus', TW: 'Taiwan', TR: 'Turkey',
};

const byName = new Map(land.features.map((f) => [f.properties.name, f]));
const cache = new Map<string, Feature<Geometry, { name: string }> | null>();

/** The country's shape by ISO 3166-1 alpha-2 code, or null when the 1:110m atlas has none (small states). */
export function countryShape(iso2: string) {
  // Only real two-letter codes: a region name ("EMEA") would make Intl.DisplayNames throw.
  if (!/^[A-Z]{2}$/.test(iso2)) return null;
  if (!cache.has(iso2)) cache.set(iso2, byName.get(ATLAS_NAME[iso2] ?? regionName.of(iso2) ?? '') ?? null);
  return cache.get(iso2)!;
}

/** Visual centre of a country (for flow lines), or null when the atlas has no shape for it. */
export function countryCentre(iso2: string): LatLng | null {
  const f = countryShape(iso2);
  if (!f) return null;
  const [lng, lat] = geoCentroid(f);
  return { lat, lng };
}

// Named regions companies report revenue for, anchored at a representative point. "Rest of world", "Other countries"
// and "Outside the United States" have no single place, so they are listed but never drawn as a line.
const REGION_ANCHOR: [RegExp, LatLng][] = [
  [/^(EMEA|Europe, Middle East and Africa)$/i, { lat: 48, lng: 12 }],
  [/^Europe$/i, { lat: 50, lng: 10 }],
  [/^Asia Pacific$/i, { lat: 20, lng: 112 }],
  [/^Americas Excluding United States$/i, { lat: -12, lng: -58 }],
  [/^US & Canada$/i, { lat: 42, lng: -98 }],
  [/^Americas$/i, { lat: 15, lng: -85 }],
];

/** Where a reported revenue line comes from: its country, or a named region's anchor; null when it has no place. */
export function lineAnchor(region: string, country: string | null): LatLng | null {
  if (country) return countryCentre(country);
  return REGION_ANCHOR.find(([re]) => re.test(region))?.[1] ?? null;
}
