import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { colors, money } from '@/lib/wealthline-theme';
import { chartBounds, chartTime, visiblePoints, type ChartProps } from '@/lib/intraday';
export type { ChartPoint } from '@/lib/intraday';

const { Pinch: createPinch, Pan: createPan } = Gesture;
const simultaneous = Gesture.Simultaneous.bind(Gesture);
function path(rows: { x: number; y: number }[]) {
  return rows.map((d, i) => `${i ? 'L' : 'M'}${d.x},${d.y}`).join(' ');
}

export default function WealthChart({
  points,
  height = 245,
  domain,
  projectedAfter,
  onZoom,
  onPan,
}: ChartProps) {
  const [width, setWidth] = useState(300);
  const plotWidth = Math.max(100, width - (domain ? 96 : 82));
  const plotHeight = height - 50;
  const visible = visiblePoints(points, domain);
  const { min, max } = chartBounds(visible);
  const from = domain?.[0] ?? Date.parse(points[0]?.timestamp ?? new Date().toISOString());
  const to = domain?.[1] ?? Date.parse(points.at(-1)?.timestamp ?? new Date().toISOString());
  const span = Math.max(1, to - from);
  const dots = visible.map((p) => ({
    time: Date.parse(p.timestamp),
    x: 4 + ((Date.parse(p.timestamp) - from) / span) * plotWidth,
    y: 14 + ((max - p.net_worth_usd) / (max - min)) * plotHeight,
  }));
  const observed = dots.filter((d) => projectedAfter == null || d.time <= projectedAfter);
  const projected = dots.filter((d) => projectedAfter != null && d.time >= projectedAfter);
  const pinch = createPinch()
    .enabled(!!onZoom)
    .runOnJS(true)
    .onChange((event) => onZoom?.(1 / event.scaleChange));
  const pan = createPan()
    .enabled(!!onPan)
    .activeOffsetX([-12, 12])
    .failOffsetY([-18, 18])
    .runOnJS(true)
    .onChange((event) => onPan?.(event.changeX / plotWidth));
  const chart = (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        accessibilityLabel={
          domain
            ? 'Intraday estimate chart. Pinch to zoom, drag sideways to explore history.'
            : 'Recorded net worth history'
        }
      >
        {[0, 1, 2, 3].map((i) => (
          <Line
            key={i}
            x1={0}
            x2={plotWidth + 4}
            y1={14 + (i * plotHeight) / 3}
            y2={14 + (i * plotHeight) / 3}
            stroke={colors.border}
            strokeDasharray="3 5"
          />
        ))}
        <Path d={path(observed)} stroke={colors.blue} strokeWidth={2.6} fill="none" />
        {!!projected.length && (
          <Path
            d={path(projected)}
            stroke={colors.projection}
            strokeWidth={2.4}
            strokeDasharray="5 4"
            fill="none"
          />
        )}
        {observed.length < 3 &&
          observed.map((d) => <Circle key={d.time} cx={d.x} cy={d.y} r={3} fill={colors.blue} />)}
        {[0, 1, 2, 3].map((i) => (
          <SvgText
            key={i}
            x={plotWidth + 12}
            y={19 + (i * plotHeight) / 3}
            fontSize={11}
            fill={colors.muted}
          >
            {domain
              ? `$${((max - ((max - min) * i) / 3) / 1e9).toFixed(span <= 60_000 ? 6 : 3)}B`
              : money(max - ((max - min) * i) / 3)}
          </SvgText>
        ))}
        {[0, 1, 2].map((i) => (
          <SvgText
            key={i}
            x={4 + (i * plotWidth) / 2}
            y={height - 5}
            textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
            fontSize={11}
            fill={colors.muted}
          >
            {domain
              ? chartTime(from + (span * i) / 2, span)
              : new Date(from + (span * i) / 2).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
  return domain ? (
    <GestureDetector gesture={simultaneous(pinch, pan)}>{chart}</GestureDetector>
  ) : (
    chart
  );
}
