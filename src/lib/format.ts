// Compact USD: 412_300_000_000 → "$412.3B". Fraction digits are explicit so live values can show more.
export function usd(value: number, digits = 1) {
  const abs = Math.abs(value);
  const [div, unit] =
    abs >= 1e12 ? [1e12, 'T'] : abs >= 1e9 ? [1e9, 'B'] : abs >= 1e6 ? [1e6, 'M'] : [1, ''];
  const n = (value / div).toFixed(unit ? digits : 0);
  return `${value < 0 ? '−' : ''}$${n.replace('-', '')}${unit}`;
}

// Direction is always shown as a glyph and a word for screen readers, never color alone.
export function direction(delta: number) {
  if (delta > 0) return { glyph: '▲', word: 'up', sign: '+' } as const;
  if (delta < 0) return { glyph: '▼', word: 'down', sign: '−' } as const;
  return { glyph: '•', word: 'unchanged', sign: '' } as const;
}

export function percent(delta: number, base: number) {
  return base ? `${((Math.abs(delta) / base) * 100).toFixed(2)}%` : '—';
}

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
export const formatDate = (iso: string | Date) => dateFmt.format(new Date(iso));
export const formatTime = (iso: string | Date) => timeFmt.format(new Date(iso));
