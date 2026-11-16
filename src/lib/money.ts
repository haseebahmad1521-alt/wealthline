// Pure conversion + compaction. Values are stored in USD; `rate` is units of `code` per 1 USD.
function symbol(code: string) {
  try {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}

// 412_300_000_000 USD at 0.89 EUR → "€366.9B"; letter symbols get a space: "kr 8.7T". Same B/T/M rules as usd().
export function convertCompact(value: number, code: string, rate: number, digits = 1) {
  const v = value * rate;
  const abs = Math.abs(v);
  const [div, unit] =
    abs >= 1e12 ? [1e12, 'T'] : abs >= 1e9 ? [1e9, 'B'] : abs >= 1e6 ? [1e6, 'M'] : [1, ''];
  // Under a million there's no unit, so group the digits: $5,000, not $5000.
  const n = unit ? (v / div).toFixed(digits).replace('-', '') : Math.round(abs).toLocaleString('en-US');
  const sym = symbol(code);
  return `${v < 0 ? '−' : ''}${sym}${/\p{L}$/u.test(sym) ? ' ' : ''}${n}${unit}`;
}
