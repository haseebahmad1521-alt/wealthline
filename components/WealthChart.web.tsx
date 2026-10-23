import { useId, useEffect, useRef } from 'react';
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
import {
  chartBounds,
  chartTime,
  preciseMoney,
  visiblePoints,
  type ChartProps,
} from '@/lib/intraday';
export type { ChartPoint } from '@/lib/intraday';

export default function WealthChart({
  points,
  height = 245,
  domain,
  projectedAfter,
  onZoom,
  onPan,
}: ChartProps) {
  const id = useId().replace(/:/g, '');
  const container = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onZoom, onPan });
  useEffect(() => {
    handlers.current = { onZoom, onPan };
  }, [onZoom, onPan]);
  const hasDomain = domain != null;
  useEffect(() => {
    const element = container.current;
    if (!element || !hasDomain) return undefined;
    const wheel = (event: WheelEvent) => {
      if (!handlers.current.onZoom) return;
      event.preventDefault();
      handlers.current.onZoom(Math.exp(Math.max(-0.4, Math.min(0.4, event.deltaY * 0.002))));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [hasDomain]);
  const drag = useRef<number | null>(null);
  const visible = visiblePoints(points, domain);
  const { min, max } = chartBounds(visible);
  const span = domain ? domain[1] - domain[0] : 0;
  const data = visible.map((p) => {
    const time = Date.parse(p.timestamp);
    return {
      time,
      observed: projectedAfter == null || time <= projectedAfter ? p.net_worth_usd : null,
      projected: projectedAfter != null && time >= projectedAfter ? p.net_worth_usd : null,
    };
  });
  return (
    <div
      ref={container}
      style={{
        width: '100%',
        height,
        minWidth: 0,
        touchAction: domain ? 'pan-y' : 'auto',
        cursor: onPan ? 'grab' : undefined,
      }}
      role="group"
      aria-label={
        domain
          ? 'Intraday estimates. Use zoom controls or scroll to zoom; drag to explore history.'
          : 'Net worth history, based on recorded estimates'
      }
      onPointerDown={(e) => {
        if (!onPan) return;
        drag.current = e.clientX;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current == null || !onPan) return;
        const fraction = (e.clientX - drag.current) / Math.max(1, e.currentTarget.clientWidth - 68);
        drag.current = e.clientX;
        onPan(fraction);
      }}
      onPointerUp={(e) => {
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 14, right: 2, left: 0, bottom: 0 }}>
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
            domain={domain ?? ['dataMin', 'dataMax']}
            allowDataOverflow
            tickFormatter={(v) =>
              domain
                ? chartTime(Number(v), span)
                : new Date(Number(v)).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })
            }
            axisLine={false}
            tickLine={false}
            minTickGap={45}
            tick={{ fill: colors.muted, fontSize: 11 }}
            dy={8}
            tickCount={4}
          />
          <YAxis
            orientation="right"
            width={domain ? 86 : 68}
            tickFormatter={(v) =>
              domain ? `$${(Number(v) / 1e9).toFixed(span < 60_000 ? 6 : 3)}B` : money(Number(v))
            }
            axisLine={false}
            tickLine={false}
            domain={[min, max]}
            allowDataOverflow
            tick={{ fill: colors.muted, fontSize: 11 }}
            tickCount={4}
          />
          <Tooltip
            filterNull
            formatter={(v, name) => [
              domain ? preciseMoney(Number(v)) : money(Number(v)),
              name === 'projected' ? 'Projected estimate' : 'Recorded / interpolated estimate',
            ]}
            labelFormatter={(v) => dateLabel(new Date(Number(v)).toISOString())}
            contentStyle={{
              border: 'none',
              borderRadius: 16,
              boxShadow: '0 4px 24px rgba(29,29,31,.08)',
              fontFamily: 'Inter',
              fontSize: 12,
              color: colors.text,
              backgroundColor: colors.surface,
            }}
          />
          <Area
            type="linear"
            dataKey="observed"
            stroke={colors.blue}
            strokeWidth={2.6}
            fill={`url(#${id})`}
            dot={
              data.length < 3
                ? { r: 3, fill: colors.blue, stroke: colors.surface, strokeWidth: 2 }
                : false
            }
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            connectNulls={false}
          />
          {projectedAfter != null && (
            <Area
              type="linear"
              dataKey="projected"
              stroke={colors.projection}
              strokeWidth={2.4}
              strokeDasharray="5 4"
              fill="none"
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
