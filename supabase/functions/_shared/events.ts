// Event studies for the World simulations: how markets actually moved around past events of the same kind. A scenario
// can say "like past Middle East escalations, twice as big" instead of guessing sizes; the sizes come from these
// measurements (scripts/build-factors.mjs measures them from the same weekly prices as the factor model). No imports, so
// Deno, Node and the app can share it.

export const ANALOGS = {
  mideast: 'Middle East escalations',
  russia: 'Russia–Ukraine war',
  'us-china': 'US–China trade escalations',
  'oil-glut': 'Oil price wars',
  pandemic: 'A pandemic',
  banking: 'Bank failures',
} as const;
export type Analog = keyof typeof ANALOGS;

/** Dated past events, each with the weeks over which markets took it in. */
export const EVENTS: { key: string; analog: Analog; label: string; from: string; to: string }[] = [
  { key: 'tankers-2019-05', analog: 'mideast', label: 'Gulf tanker attacks, May 2019', from: '2019-05-13', to: '2019-05-26' },
  { key: 'tankers-2019-06', analog: 'mideast', label: 'Gulf of Oman tanker attacks, June 2019', from: '2019-06-10', to: '2019-06-23' },
  { key: 'abqaiq-2019', analog: 'mideast', label: 'Strike on Saudi oil facilities, Sept 2019', from: '2019-09-16', to: '2019-09-29' },
  { key: 'soleimani-2020', analog: 'mideast', label: 'US strike on Soleimani, Jan 2020', from: '2019-12-30', to: '2020-01-12' },
  { key: 'oct7-2023', analog: 'mideast', label: 'Hamas attack on Israel, Oct 2023', from: '2023-10-09', to: '2023-10-22' },
  { key: 'iran-israel-2024-04', analog: 'mideast', label: 'Iran–Israel strikes, Apr 2024', from: '2024-04-15', to: '2024-04-21' },
  { key: 'iran-israel-2024-10', analog: 'mideast', label: 'Iran missile strike on Israel, Oct 2024', from: '2024-09-30', to: '2024-10-13' },
  { key: 'iran-war-2025-06', analog: 'mideast', label: 'Israel–Iran war and US strikes, June 2025', from: '2025-06-09', to: '2025-06-29' },
  { key: 'invasion-2022', analog: 'russia', label: 'Invasion of Ukraine, Feb 2022', from: '2022-02-21', to: '2022-03-06' },
  { key: 'tariffs-2018-03', analog: 'us-china', label: 'US tariffs on China, Mar 2018', from: '2018-03-19', to: '2018-04-01' },
  { key: 'tariffs-2019-05', analog: 'us-china', label: 'Tariff hike on China, May 2019', from: '2019-05-06', to: '2019-05-19' },
  { key: 'tariffs-2019-08', analog: 'us-china', label: 'China named a currency manipulator, Aug 2019', from: '2019-08-05', to: '2019-08-11' },
  { key: 'tariffs-2025-04', analog: 'us-china', label: '“Liberation Day” tariffs and China’s answer, Apr 2025', from: '2025-03-31', to: '2025-04-13' },
  { key: 'price-war-2020', analog: 'oil-glut', label: 'Saudi–Russia oil price war, Mar 2020', from: '2020-03-09', to: '2020-03-15' },
  { key: 'covid-2020', analog: 'pandemic', label: 'COVID crash, Feb–Mar 2020', from: '2020-02-17', to: '2020-03-22' },
  { key: 'svb-2023', analog: 'banking', label: 'US bank failures, Mar 2023', from: '2023-03-06', to: '2023-03-19' },
];

/** What markets did over an event: global stocks, oil, China and the dollar (each beyond the market), each sector fund
 * beyond the market, and the oil price itself (for telling the story). Log returns summed over the event's weeks. */
export type EventMoves = { market: number; oil: number; china: number; usd: number; oilPrice: number; sector: Record<string, number> };

/** The ISO week keys an event covers, from `weekKey` (factors.ts) applied a week apart. */
export function eventWeeks(from: string, to: string, weekKey: (t: number) => string): string[] {
  const out = new Set<string>();
  for (let t = Date.parse(`${from}T12:00:00Z`) / 1000; t <= Date.parse(`${to}T12:00:00Z`) / 1000 + 1; t += 7 * 86400) out.add(weekKey(t));
  return [...out].sort();
}

/** Sum of weekly values over the weeks; null when a week is missing. */
export function sumWeeks(series: Map<string, number>, weeks: string[]): number | null {
  let s = 0;
  for (const w of weeks) {
    const v = series.get(w);
    if (v == null) return null;
    s += v;
  }
  return s;
}

/** One kind of event summarised: the average move of each factor and sector across its events, and their spread. */
export type AnalogMoves = { analog: Analog; events: string[]; mean: EventMoves; sd: EventMoves };

export function summarise(analog: Analog, measured: { label: string; moves: EventMoves }[]): AnalogMoves | null {
  if (!measured.length) return null;
  const keys = ['market', 'oil', 'china', 'usd', 'oilPrice'] as const;
  const sectors = [...new Set(measured.flatMap((m) => Object.keys(m.moves.sector)))];
  const avg = (vals: number[]) => vals.reduce((n, v) => n + v, 0) / vals.length;
  // With one event the spread is unknown: take half the move itself as its uncertainty.
  const spread = (vals: number[]) => (vals.length > 1 ? Math.sqrt(vals.reduce((n, v) => n + (v - avg(vals)) ** 2, 0) / (vals.length - 1)) : Math.abs(vals[0]) / 2);
  const pick = (f: (vals: number[]) => number): EventMoves => ({
    ...(Object.fromEntries(keys.map((k) => [k, f(measured.map((m) => m.moves[k]))])) as Omit<EventMoves, 'sector'>),
    sector: Object.fromEntries(sectors.map((s) => [s, f(measured.map((m) => m.moves.sector[s] ?? 0))])),
  });
  return { analog, events: measured.map((m) => m.label), mean: pick(avg), sd: pick(spread) };
}
