import { colors, fonts } from '@/lib/wealthline-theme';
export default function DateField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <input
      type="date"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        height: 46,
        padding: '10px 14px',
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        background: colors.soft,
        color: colors.text,
        fontFamily: fonts.regular,
        fontSize: 14,
      }}
    />
  );
}
