// Analogs: "markets move as they did around past events of this kind". An analog change in a scenario becomes the
// measured average moves of global stocks, oil, China, the dollar and each sector fund across those past events
// (src/data/events.json, built by scripts/build-factors.mjs), times its intensity, each carrying the spread between the
// events as its own uncertainty. The analog itself stays in the list (one notification); its parts are quiet.
import type { Scenario, Shock } from '../../supabase/functions/_shared/scenario.ts';
import { ANALOGS, type Analog } from '../../supabase/functions/_shared/events.ts';

type Moves = { market: number; oil: number; china: number; usd: number; oilPrice: number; sector: Record<string, number> };
export type AnalogData = { events: string[]; mean: Moves; sd: Moves };
export type EventData = { analogs: Record<string, AnalogData>; events: { key: string; analog: string; label: string; from?: string; weeks?: number; moves: Moves }[] };

const MIN = 0.002; // moves smaller than this (0.2%) are left out

const NOTE = 'Market moves as around ';

/** The scenario with each analog change expanded into its measured parts (and an assumption naming the events). */
export function expandAnalogs(given: Scenario, data: EventData | null): Scenario {
  // Start from the scenario without earlier expansions (a continued scenario carries its first part's), so nothing
  // is counted twice.
  const s = { ...given, shocks: given.shocks.filter((x) => !('quiet' in x && x.quiet)), assumptions: given.assumptions.filter((a) => !a.startsWith(NOTE)) };
  const analogs = s.shocks.filter((x): x is Extract<Shock, { kind: 'analog' }> => x.kind === 'analog');
  if (!analogs.length || !data) return s;
  const parts: Shock[] = [];
  const notes: string[] = [];
  for (const a of analogs) {
    const d = data.analogs[a.target];
    if (!d) continue;
    const k = a.pct;
    const span = { from: a.from, to: a.to };
    const add = (shock: Shock) => Math.abs(shock.pct) >= MIN && parts.push(shock);
    // Measured moves are log returns: a move of L is a price change of e^L - 1. The spread stays in log terms.
    const move = (logMove: number) => Math.exp(logMove * k) - 1;
    add({ kind: 'market', target: '', pct: move(d.mean.market), sd: d.sd.market * k, quiet: true, ...span });
    for (const f of ['oil', 'china', 'usd'] as const) add({ kind: 'factor', target: f, pct: move(d.mean[f]), sd: d.sd[f] * k, quiet: true, direct: true, ...span });
    for (const [sector, v] of Object.entries(d.mean.sector)) add({ kind: 'sector', target: sector as never, pct: move(v), sd: (d.sd.sector[sector] ?? 0) * k, quiet: true, ...span });
    const times = Math.abs(k - 1) < 0.05 ? '' : `, ${Math.round(k * 10) / 10}× as strongly`;
    notes.push(`${NOTE}${d.events.length} past ${ANALOGS[a.target as Analog].toLowerCase()}${times}: ${d.events.join('; ')}.`);
  }
  return { ...s, shocks: [...s.shocks, ...parts], assumptions: [...s.assumptions, ...notes] };
}

/** The measured average for an analog, in words: what stocks, oil and defence did on average. */
export function analogSummary(a: Analog, data: EventData | null): string | null {
  const d = data?.analogs[a];
  if (!d) return null;
  const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 1000) / 10)}%`;
  return `After ${d.events.length} past ${ANALOGS[a].toLowerCase()}: global stocks ${pct(d.mean.market)}, oil ${pct(d.mean.oilPrice)}, defence ${pct(d.mean.sector.defense ?? 0)} and energy ${pct(d.mean.sector.energy ?? 0)} against the market, on average.`;
}

/** The past events behind a scenario's analog changes, most recent first: what "last time" looked like. */
export function pastEvents(s: Scenario, data: EventData | null): { key: string; label: string }[] {
  if (!data) return [];
  const kinds = new Set<string>(s.shocks.filter((x) => x.kind === 'analog').map((x) => x.target));
  return data.events
    .filter((e) => kinds.has(e.analog))
    .sort((a, b) => (b.from ?? '').localeCompare(a.from ?? ''))
    .map((e) => ({ key: e.key, label: e.label }));
}

export const REPLAY = 'replay:';

/**
 * "Last time this happened": one past event's measured moves (global stocks, oil, China, the dollar, each sector fund
 * beyond the market) played on today's fortunes. These are what markets actually did, so they carry no spread of their
 * own; each company's own news over those weeks still widens the ranges.
 */
export function replayScenario(key: string, data: EventData | null): Scenario | null {
  const e = data?.events.find((x) => x.key === key);
  if (!e) return null;
  const move = (logMove: number) => Math.exp(logMove) - 1;
  const span = { from: 0, to: 1 };
  const shocks: Shock[] = [];
  const add = (shock: Shock) => Math.abs(shock.pct) >= MIN && shocks.push(shock);
  add({ kind: 'market', target: '', pct: move(e.moves.market), ...span });
  for (const f of ['oil', 'china', 'usd'] as const) add({ kind: 'factor', target: f, pct: move(e.moves[f]), quiet: true, direct: true, ...span });
  // Sector notifications only for the big ones; the rest still move prices.
  for (const [sector, v] of Object.entries(e.moves.sector)) add({ kind: 'sector', target: sector as never, pct: move(v), ...(Math.abs(v) < 0.02 ? { quiet: true } : {}), ...span });
  const oil = move(e.moves.oilPrice);
  const weeks = e.weeks ?? 1;
  return {
    id: `${REPLAY}${e.key}`,
    origin: 'example',
    title: `If it happened today: ${e.label}`,
    summary: `What markets did around ${e.label} (${weeks} week${weeks === 1 ? '' : 's'}), played on today’s fortunes.`,
    plausibility: 'possible',
    reason: 'It happened: these are the measured moves.',
    months: 1,
    shocks,
    beats: Math.abs(oil) >= 0.03 ? [{ month: 0, text: `Oil prices ${oil > 0 ? 'jump' : 'fall'}`, tone: oil > 0 ? 'gain' : 'loss' }] : [],
    assumptions: [`Market moves as measured around ${e.label}; weekly prices from Yahoo Finance (src/data/events.json).`],
    sources: [],
  };
}
