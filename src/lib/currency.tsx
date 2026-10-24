import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { formatDate } from './format';
import { convertCompact } from './money';
import { sessionStorage } from './session-storage';

const KEY = 'wl.currency';
const API = 'https://api.frankfurter.dev/v1';
const HOUR = 3_600_000;

type Rates = { date: string; rates: Record<string, number> };

function read() {
  try {
    return sessionStorage?.getItem(KEY) || 'USD';
  } catch {
    return 'USD';
  }
}

type Ctx = { choice: string; setChoice: (code: string) => void; rates: Rates | undefined };
const CurrencyContext = createContext<Ctx>({ choice: 'USD', setChoice: () => {}, rates: undefined });

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [choice, set] = useState(read);
  const setChoice = useCallback((code: string) => {
    set(code);
    try {
      sessionStorage?.setItem(KEY, code);
    } catch {}
  }, []);
  const { data } = useQuery({
    queryKey: ['fx-rates'],
    staleTime: 6 * HOUR,
    queryFn: async (): Promise<Rates> => {
      const res = await fetch(`${API}/latest?base=USD`);
      if (!res.ok) throw new Error('Exchange rates unavailable.');
      return res.json();
    },
  });
  const value = useMemo(() => ({ choice, setChoice, rates: data }), [choice, setChoice, data]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/** Display-currency helpers. Falls back to USD whenever the chosen currency has no loaded rate. */
export function useMoney() {
  const { choice, rates } = useContext(CurrencyContext);
  const rate = choice !== 'USD' ? rates?.rates[choice] : undefined;
  const code = rate ? choice : 'USD';
  return useMemo(
    () => ({
      code,
      rate: rate ?? 1,
      rateDate: rate && rates ? rates.date : null,
      format: (usdValue: number, digits = 1) => convertCompact(usdValue, code, rate ?? 1, digits),
    }),
    [code, rate, rates],
  );
}

/** Picker data: the chosen code (even if rates failed), loaded currency names, and the setter. */
export function useCurrencyChoice() {
  const { choice, setChoice, rates } = useContext(CurrencyContext);
  const names = useQuery({
    queryKey: ['fx-currencies'],
    staleTime: 24 * HOUR,
    queryFn: async (): Promise<Record<string, string>> => {
      const res = await fetch(`${API}/currencies`);
      if (!res.ok) throw new Error('Currency list unavailable.');
      return res.json();
    },
  });
  return { choice, setChoice, names: names.data, rates, loading: names.isPending };
}

/** "Converted at the ECB rate of Oct 23, 2026 · 1 USD = 0.8934 EUR", or null for USD / no rate. */
export function rateCaption(m: ReturnType<typeof useMoney>) {
  if (m.code === 'USD' || !m.rateDate) return null;
  return `Converted at the ECB rate of ${formatDate(m.rateDate + 'T12:00:00Z')} · 1 USD = ${m.rate.toFixed(4)} ${m.code}`;
}
