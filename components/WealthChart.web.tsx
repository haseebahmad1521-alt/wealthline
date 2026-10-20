import { useId } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { colors, money, dateLabel } from '@/lib/wealthline-theme';
export type ChartPoint = { timestamp: string; net_worth_usd: number };
export default function WealthChart({
  points,
  height = 245,
}: {
  points: ChartPoint[];
  height?: number;
}) {
  const id = useId().replace(/:/g, '');
  const data = points.map((p) => ({
    time: new Date(p.timestamp).getTime(),
    worth: p.net_worth_usd,
  }));
  return (
    <div
      style={{ width: '100%', height, minWidth: 0 }}
      role="img"
      aria-label="Net worth history, based on recorded estimates"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 14, right: 8, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.blue} stopOpacity={0.1} />
              <stop offset="100%" stopColor={colors.blue} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={colors.border} strokeDasharray="3 5" />
          <XAxis
            dataKey="time"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v) =>
              new Date(Number(v)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }
            axisLine={false}
            tickLine={false}
            minTickGap={80}
            tick={{ fill: colors.muted, fontSize: 11 }}
            dy={10}
          />
          <YAxis
            orientation="right"
            width={58}
            tickFormatter={(v) => money(Number(v))}
            axisLine={false}
            tickLine={false}
            domain={['dataMin - 10000000000', 'dataMax + 10000000000']}
            tick={{ fill: colors.muted, fontSize: 11 }}
            tickCount={4}
          />
          <Tooltip
            formatter={(v) => [money(Number(v)), 'Estimated net worth']}
            labelFormatter={(v) => `Last updated ${dateLabel(new Date(Number(v)).toISOString())}`}
            contentStyle={{
              border: 'none',
              borderRadius: 16,
              boxShadow: '0 4px 24px rgba(29,29,31,.08)',
              fontFamily: 'Inter',
              fontSize: 12,
            }}
          />
          <Area
            type="linear"
            dataKey="worth"
            stroke={colors.blue}
            strokeWidth={2.6}
            fill={`url(#${id})`}
            dot={
              data.length < 3
                ? { r: 4, fill: colors.blue, stroke: colors.surface, strokeWidth: 2 }
                : false
            }
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
