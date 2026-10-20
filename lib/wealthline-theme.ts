export const colors = {
  background: '#FBFBFD',
  surface: '#FFFFFF',
  text: '#1D1D1F',
  muted: '#6E6E73',
  blue: '#0071E3',
  green: '#1E7B45',
  red: '#B42318',
  border: '#E8E8ED',
  soft: '#F5F5F7',
  amber: '#805900',
  amberSoft: '#FFF5D6',
  greenSoft: '#EDF7F0',
};
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};
export function money(value: number | null | undefined) {
  return value == null
    ? '—'
    : `$${(value / 1e9).toLocaleString('en-US', { maximumFractionDigits: 1 })}B`;
}
export function dateLabel(value?: string | null) {
  return value
    ? new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : 'Not available';
}
