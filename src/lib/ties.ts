// Documented ties for the briefing: public records that connect tracked companies to a storyline's policy area, each
// with its source. They describe a connection on the record (a government contract), never a claim that anyone is
// driving events. Data: src/data/ties.json (USAspending.gov contracts, built by scripts/build-ties.mjs).
import type { Scenario } from '../../supabase/functions/_shared/scenario.ts';

export type ContractTie = { company: string; contracts: number; defense: number; recipients: string[]; url: string };
export type Tie = { companyId: string; company: string; owners: { id: string; name: string }[]; defense: number; contracts: number; url: string; recipients: string[] };

// War and security storylines: analogs of armed conflict, a defence sector move, or words that say so.
const WAR_ANALOGS = new Set(['mideast', 'russia']);
const WAR_WORDS = /\b(war|wars|strike|strikes|military|missile|invasion|invade|defen[cs]e|troops|attack|conflict|bomb)/i;

/** True when a storyline is about armed conflict or security, so defence contracts are the relevant record. */
export function isSecurityStory(s: Scenario): boolean {
  return (
    s.shocks.some((x) => (x.kind === 'analog' && WAR_ANALOGS.has(x.target)) || (x.kind === 'sector' && x.target === 'defense' && !('quiet' in x && x.quiet))) ||
    WAR_WORDS.test(`${s.title} ${s.summary}`)
  );
}

/**
 * The defence-contract ties for a security storyline: tracked companies with Department of Defense contracts, largest
 * first, each with the tracked people linked to it. Other storylines get none (yet: lobbying records come next).
 */
export function tiesFor(
  s: Scenario,
  contracts: Record<string, ContractTie>,
  ownersOf: (companyId: string) => { id: string; name: string }[],
  count = 4,
): Tie[] {
  if (!isSecurityStory(s)) return [];
  const seen = new Set<string>();
  return Object.entries(contracts)
    .filter(([, c]) => c.defense >= 1e8) // at least $100M from defence over the period
    .sort((a, b) => b[1].defense - a[1].defense)
    .flatMap(([id, c]) => {
      const owners = ownersOf(id);
      // One line per company even when two records name it (Alphabet and Google), and only companies tied to someone.
      const key = c.recipients.join('|');
      if (!owners.length || seen.has(key)) return [];
      seen.add(key);
      return [{ companyId: id, company: c.company, owners, defense: c.defense, contracts: c.contracts, url: c.url, recipients: c.recipients }];
    })
    .slice(0, count);
}
