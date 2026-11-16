// Share links for simulations: the parameters that reopen a scenario, a built-in match or dial settings. Pure, so it
// can be tested without React Native; share.ts builds the full URL and opens the share sheet.
import type { Scenario } from '../../supabase/functions/_shared/scenario.ts';
import type { DialValues } from './dials.ts';

export type SimLink = { sim?: string; vs?: string; dials?: string };

/** The link parameters for a scenario: built-in matches and dials are rebuilt from their choices, the rest by id. */
export function simParams(s: Scenario, dials: DialValues): SimLink {
  if (s.origin === 'dials') {
    const set = Object.entries(dials).filter(([, v]) => v);
    return { dials: set.map(([k, v]) => `${k}:${v}`).join(',') };
  }
  // A built-in match is decided again on opening (the same rule on the same recorded numbers), so the link names only
  // the two rivals.
  const m = /^versus:([a-z0-9-]+):([a-z0-9-]+):(price|market|talent)$/.exec(s.id);
  if (m) return { vs: `${m[1]},${m[2]}` };
  return { sim: s.id };
}

/** Reads link parameters back: a built-in match, dial settings, or a scenario id. */
export function readSimParams(p: SimLink): { vs?: { a: string; b: string }; dials?: DialValues; sim?: string } {
  if (p.vs) {
    // Older links also carry a battle and a winner; the match is decided again either way.
    const [a, b] = p.vs.split(',');
    if (a && b && /^[a-z0-9-]{2,80}$/.test(a) && /^[a-z0-9-]{2,80}$/.test(b)) return { vs: { a, b } };
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

