// Share links for simulations: the parameters that reopen a scenario, a built-in match or dial settings. Pure, so it
// can be tested without React Native; share.ts builds the full URL and opens the share sheet.
import type { Scenario } from '../../supabase/functions/_shared/scenario.ts';
import type { DialValues } from './dials.ts';
import type { Battle } from './versus.ts';

export type SimLink = { sim?: string; vs?: string; dials?: string };

/** The link parameters for a scenario: built-in matches and dials are rebuilt from their choices, the rest by id. */
export function simParams(s: Scenario, dials: DialValues): SimLink {
  if (s.origin === 'dials') {
    const set = Object.entries(dials).filter(([, v]) => v);
    return { dials: set.map(([k, v]) => `${k}:${v}`).join(',') };
  }
  const m = /^versus:([a-z0-9-]+):([a-z0-9-]+):(price|market|talent):(a|b)$/.exec(s.id);
  if (m) return { vs: `${m[1]},${m[2]},${m[3]},${m[4]}` };
  return { sim: s.id };
}

/** Reads link parameters back: a built-in match, dial settings, or a scenario id. */
export function readSimParams(p: SimLink): { vs?: { a: string; b: string; battle: Battle; winner: 'a' | 'b' }; dials?: DialValues; sim?: string } {
  if (p.vs) {
    const [a, b, battle, winner] = p.vs.split(',');
    if (a && b && /^(price|market|talent)$/.test(battle) && /^(a|b)$/.test(winner)) return { vs: { a, b, battle: battle as Battle, winner: winner as 'a' | 'b' } };
  }
  if (p.dials !== undefined) {
    const out: DialValues = {};
    for (const part of p.dials.split(',')) {
      const [k, v] = part.split(':');
      const n = Number(v);
      if (k && /^[a-z]+$/.test(k) && Number.isFinite(n) && Math.abs(n) <= 100) out[k] = Math.round(n);
    }
    return { dials: out };
  }
  if (p.sim && /^[a-z0-9-]{1,80}$/i.test(p.sim)) return { sim: p.sim };
  return {};
}

