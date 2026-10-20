import { View, useWindowDimensions } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { colors, money } from '@/lib/wealthline-theme';
export type ChartPoint = { timestamp: string; net_worth_usd: number };
export default function WealthChart({
  points,
  height = 245,
}: {
  points: ChartPoint[];
  height?: number;
}) {
  const { width } = useWindowDimensions();
  const w = Math.min(width - 72, 1030),
    h = height - 35;
  const values = points.map((p) => p.net_worth_usd);
  const min = Math.min(...values) - 1e10,
    max = Math.max(...values) + 1e10;
  const dots = points.map((p, i) => ({
    timestamp: p.timestamp,
    x: points.length === 1 ? w / 2 : 10 + (i * (w - 80)) / (points.length - 1),
    y: 15 + (1 - (p.net_worth_usd - min) / (max - min)) * (h - 25),
  }));
  return (
    <View style={{ height }}>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        accessibilityLabel="Recorded net worth history"
      >
        {[0, 1, 2, 3].map((i) => (
          <Line
            key={i}
            x1={0}
            x2={w - 55}
            y1={15 + (i * (h - 25)) / 3}
            y2={15 + (i * (h - 25)) / 3}
            stroke={colors.border}
            strokeDasharray="3 5"
          />
        ))}
        <Path
          d={dots.map((d, i) => `${i ? 'L' : 'M'}${d.x},${d.y}`).join(' ')}
          stroke={colors.blue}
          strokeWidth={2.6}
          fill="none"
        />
        {dots.length < 3 &&
          dots.map((d) => <Circle key={d.timestamp} cx={d.x} cy={d.y} r={4} fill={colors.blue} />)}
        {[0, 1, 2, 3].map((i) => (
          <SvgText key={i} x={w - 48} y={20 + (i * (h - 25)) / 3} fontSize={11} fill={colors.muted}>
            {money(max - ((max - min) * i) / 3)}
          </SvgText>
        ))}
        {points.length > 0 && (
          <SvgText x={5} y={height - 5} fontSize={11} fill={colors.muted}>
            {new Date(points[0].timestamp).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </SvgText>
        )}
      </Svg>
    </View>
  );
}
