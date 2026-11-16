// The simulation's inputs from the app's data: tracked fortunes with their companies (sector, measured sensitivities,
// operating margin) and countries with their World Bank regions. Shared by the World tab and the Rankings exposure card.
import type { SimCountry, SimEmpire } from '@/lib/simulate';
import type { Empire } from '@/lib/world';
import type { useSimData } from '@/lib/scenarios';

type SimData = NonNullable<ReturnType<typeof useSimData>['data']>;

export function toSimEmpires(empires: Empire[], sim: SimData | undefined): SimEmpire[] {
  return empires.map((e) => ({
    person: e.person,
    stakes: e.stakes,
    companies: e.companies.map((c) => ({
      id: c.id,
      name: c.name,
      sector: sim?.sectors.get(c.id) ?? null,
      listed: !c.is_private && !!c.ticker,
      regions: c.regions,
      fit: sim?.fits.get(c.id) ?? null,
      margin: sim?.margins.get(c.id) ?? null,
    })),
  }));
}

export function toSimCountries(countries: { iso2: string; gdp_usd: number | null }[] | undefined, sim: SimData | undefined): SimCountry[] {
  return (countries ?? []).map((c) => ({ ...c, region: sim?.regions.get(c.iso2) ?? null }));
}
