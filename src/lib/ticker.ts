// Live ticker selection. Pure: rows come from public.ticker_moves (first and last observation per company and
// person inside a window); this only picks a window, filters, sorts and labels. No value is invented.

export type MoveRow = {
  kind: 'company' | 'person';
  key: string; // ticker or person slug
  label: string;
  currency: string;
  start_value: number;
  end_value: number;
  change: number;
  change_pct: number | null;
  start_as_of: string | null;
  as_of: string;
  value_kind: 'quote' | 'computed' | 'estimate';
};

/** 'live' = observed market movement in the window; 'close' = the last session; 'estimate' = between dated estimates. */
export type Basis = 'live' | 'close' | 'estimate';
export type TickerItem = {
  kind: MoveRow['kind'];
  key: string;
  label: string;
  change: number;
  changePct: number;
  asOf: number;
  basis: Basis;
};
export type Ticker = { mode: 'live' | 'close' | 'empty'; hours: number | null; items: TickerItem[] };

export const WINDOWS = [1, 3, 6, 12, 24] as const;
export type WindowHours = (typeof WINDOWS)[number];
export const MIN_MOVERS = 8;
export const MAX_ITEMS = 24;
/** Smaller moves are rounding noise and read as "0.00%". */
export const MIN_MOVE_PCT = 0.005;

const moved = (r: MoveRow) => r.change_pct != null && Number.isFinite(r.change_pct) && Math.abs(r.change_pct) >= MIN_MOVE_PCT;
const observed = (r: MoveRow) => r.value_kind !== 'estimate';
const id = (r: { kind: string; key: string }) => `${r.kind}:${r.key}`;

function item(r: MoveRow, basis: Basis): TickerItem {
  return { kind: r.kind, key: r.key, label: r.label, change: r.change, changePct: r.change_pct as number, asOf: Date.parse(r.as_of), basis };
}

const byMove = (a: TickerItem, b: TickerItem) => Math.abs(b.changePct) - Math.abs(a.changePct) || a.label.localeCompare(b.label);

/**
 * Smallest window with at least MIN_MOVERS observed movers wins. Otherwise (markets closed) the last session's
 * moves are shown as "At close", together with whatever is still moving now and, labeled as such, moves between
 * dated estimates. Estimates are never part of a live window.
 */
export function chooseTicker(live: Partial<Record<WindowHours, MoveRow[]>>, atClose: MoveRow[] | null | undefined): Ticker {
  for (const hours of WINDOWS) {
    const rows = (live[hours] ?? []).filter((r) => observed(r) && moved(r));
    if (rows.length >= MIN_MOVERS) {
      return { mode: 'live', hours, items: rows.map((r) => item(r, 'live')).sort(byMove).slice(0, MAX_ITEMS) };
    }
  }

  const longest = [...WINDOWS].reverse().find((h) => live[h]?.length);
  const still = (longest ? live[longest]! : []).filter((r) => observed(r) && moved(r)).map((r) => item(r, 'live'));
  const seen = new Set(still.map(id));
  const close = (atClose ?? [])
    .filter((r) => moved(r) && !seen.has(id(r)))
    .map((r) => item(r, observed(r) ? 'close' : 'estimate'));
  const items = [...still, ...close].sort(byMove).slice(0, MAX_ITEMS);
  if (!items.length) return { mode: 'empty', hours: null, items };
  return close.length ? { mode: 'close', hours: null, items } : { mode: 'live', hours: longest ?? null, items };
}

/** "now", "12m", "2h", "3d": how old the last observation is. */
export function age(asOf: number, now: number) {
  const m = Math.max(0, Math.floor((now - asOf) / 60_000));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
