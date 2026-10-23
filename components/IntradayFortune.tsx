import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';
import { Button, Skeleton, Slider } from 'heroui-native';
import { Clock3, Minus, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Type, Panel, Stamp, DataState, Empty } from '@/components/wealthline-ui';
import WealthChart from '@/components/WealthChart';
import { useHistory, type Person, type ChartRange } from '@/lib/wealthline';
import { colors, money } from '@/lib/wealthline-theme';
import {
  useIntraday,
  useClock,
  useSmoothNumber,
  projectEstimate,
  preciseMoney,
  DEFAULT_WINDOW,
  MIN_WINDOW,
  MAX_WINDOW,
  windowLabel,
  visiblePoints,
} from '@/lib/intraday';

type Range = '3H' | ChartRange;
export default function IntradayFortune({ person }: { person: Person }) {
  const params = useLocalSearchParams<{ range?: string }>();
  const [range, setRange] = useState<Range>(() => {
    const requested = params.range;
    return requested === '1D' || requested === '1M' || requested === 'YTD' || requested === 'All'
      ? requested
      : '3H';
  });
  const [windowMs, setWindowMs] = useState(DEFAULT_WINDOW);
  const [offset, setOffset] = useState(0);
  const { width } = useWindowDimensions();
  const desktop = width >= 800;
  const intraday = useIntraday(person.id);
  const history = useHistory(person, range === '3H' ? '1D' : range, range !== '3H');
  const clock = useClock();
  const now = useSmoothNumber(clock);
  const smoothWindow = useSmoothNumber(windowMs);
  const smoothOffset = useSmoothNumber(offset);
  const projection = projectEstimate(intraday.data ?? [], now);
  const domain: [number, number] = [now - smoothOffset - smoothWindow, now - smoothOffset];
  const visible = visiblePoints(projection.points, domain);
  const query = range === '3H' ? intraday : history;
  const points = range === '3H' ? projection.points : (history.data ?? []);
  const displayedWorth =
    range === '3H'
      ? (projection.worth ?? person.worth)
      : (points.at(-1)?.net_worth_usd ?? person.worth);
  const first = range === '3H' ? visible[0] : points[0];
  const last = range === '3H' ? visible.at(-1) : points.at(-1);
  const delta = first && last && first !== last ? last.net_worth_usd - first.net_worth_usd : null;
  const projecting = range === '3H' && projection.projecting;
  function select(next: Range) {
    if (next !== range) {
      setRange(next);
      void Haptics.selectionAsync();
    }
  }
  function zoom(factor: number) {
    setWindowMs((current) => Math.min(MAX_WINDOW, Math.max(MIN_WINDOW, current * factor)));
  }
  function pan(fraction: number) {
    setOffset((current) =>
      Math.min(MAX_WINDOW - windowMs, Math.max(0, current + fraction * windowMs)),
    );
  }
  const hasVisible = range !== '3H' ? points.length > 0 : visible.length > 0;
  return (
    <Panel style={{ padding: desktop ? 30 : 18, gap: 20 }}>
      <View
        style={{
          flexDirection: desktop ? 'row' : 'column',
          justifyContent: 'space-between',
          alignItems: desktop ? 'center' : 'flex-start',
          gap: 14,
        }}
      >
        <Type weight="semibold" style={{ fontSize: 18 }}>
          The fortune.
        </Type>
        <View
          style={{
            flexDirection: 'row',
            gap: 5,
            alignItems: 'center',
            backgroundColor: projecting ? colors.amberSoft : colors.soft,
            borderRadius: 20,
            paddingVertical: 6,
            paddingHorizontal: 10,
          }}
        >
          <View
            style={{
              height: 6,
              width: 6,
              borderRadius: 3,
              backgroundColor: projecting ? colors.amber : colors.muted,
            }}
          />
          <Type style={{ fontSize: 11, color: projecting ? colors.amber : colors.muted }}>
            {projecting
              ? 'Projected · updates each second'
              : range === '3H'
                ? 'Recorded estimates · not live'
                : 'Recorded history'}
          </Type>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Type style={{ fontSize: 12, color: colors.muted }}>
          {projecting ? 'Projected net worth' : 'Estimated net worth'}
        </Type>
        <Type
          weight="bold"
          accessibilityLiveRegion="none"
          style={{
            fontSize: desktop ? 52 : width < 360 ? 31 : 38,
            lineHeight: desktop ? 62 : 46,
            letterSpacing: -1.8,
            fontVariant: ['tabular-nums'],
          }}
        >
          {range === '3H' && projecting ? preciseMoney(displayedWorth) : money(displayedWorth)}
        </Type>
        {delta != null && (
          <Type style={{ fontSize: 13, color: delta >= 0 ? colors.green : colors.red }}>
            {delta >= 0 ? '▲' : '▼'} {money(Math.abs(delta))} in this window
            {projecting ? ' · includes projection' : ''}
          </Type>
        )}
        <Stamp
          at={
            range === '3H'
              ? (intraday.data?.at(-1)?.timestamp ?? person.asOf)
              : (points.at(-1)?.timestamp ?? person.asOf)
          }
        />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
        {(['3H', '1D', '1M', 'YTD', 'All'] as const).map((r) => (
          <Button
            key={r}
            size="sm"
            variant="tertiary"
            accessibilityLabel={r === '3H' ? 'Intraday: three hours' : `${r} history`}
            accessibilityState={{ selected: range === r }}
            className="rounded-full"
            style={{
              minWidth: 44,
              minHeight: 44,
              paddingHorizontal: 10,
              backgroundColor: range === r ? colors.hero : colors.soft,
            }}
            onPress={() => {
              select(r);
              if (r === '3H') {
                setWindowMs(DEFAULT_WINDOW);
                setOffset(0);
              }
            }}
          >
            <Button.Label
              style={{ fontSize: 12, color: range === r ? colors.heroInk : colors.muted }}
            >
              {r}
            </Button.Label>
          </Button>
        ))}
      </View>
      {query.isPending ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : query.isError ? (
        <DataState loading={false} error retry={() => void query.refetch()} />
      ) : hasVisible ? (
        <WealthChart
          points={points}
          height={desktop ? 320 : 245}
          domain={range === '3H' ? domain : undefined}
          projectedAfter={range === '3H' ? projection.projectedAfter : undefined}
          onZoom={range === '3H' ? zoom : undefined}
          onPan={range === '3H' ? pan : undefined}
        />
      ) : range === '3H' ? (
        <View
          style={{
            minHeight: desktop ? 200 : 160,
            paddingVertical: 22,
            gap: 15,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Clock3 size={28} color={colors.muted} strokeWidth={2} />
          <Type style={{ color: colors.muted, textAlign: 'center', maxWidth: 350 }}>
            {intraday.data?.length
              ? 'No estimates in this window.'
              : 'No recent intraday estimates.'}
          </Type>
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            onPress={() => {
              if (intraday.data?.length) {
                setWindowMs(MAX_WINDOW);
                setOffset(0);
              } else select('1M');
            }}
          >
            <Button.Label>
              {intraday.data?.length ? 'Show past 24 hours' : 'View recorded history'}
            </Button.Label>
          </Button>
        </View>
      ) : (
        <Empty
          title="No recorded estimates in this range."
          label="View all history"
          action={() => select('All')}
        />
      )}
      {range === '3H' && (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Button
              isIconOnly
              size="sm"
              variant="secondary"
              className="rounded-full"
              accessibilityLabel="Zoom out"
              isDisabled={!intraday.data?.length || windowMs >= MAX_WINDOW}
              onPress={() => {
                zoom(2);
                void Haptics.selectionAsync();
              }}
            >
              <Minus size={16} color={colors.text} />
            </Button>
            <View style={{ flex: 1, gap: 6 }}>
              <Type style={{ fontSize: 11, color: colors.muted, textAlign: 'center' }}>
                {windowLabel(windowMs)} window
              </Type>
              <Slider
                accessibilityLabel="Chart zoom, 24 hours to 10 seconds"
                value={Math.log(MAX_WINDOW / windowMs) / Math.log(MAX_WINDOW / MIN_WINDOW)}
                minValue={0}
                maxValue={1}
                step={0.001}
                isDisabled={!intraday.data?.length}
                onChange={(v) => {
                  const n = Array.isArray(v) ? v[0] : v;
                  setWindowMs(MAX_WINDOW / Math.exp(n * Math.log(MAX_WINDOW / MIN_WINDOW)));
                }}
                onChangeEnd={() => void Haptics.selectionAsync()}
              >
                <Slider.Track>
                  <Slider.Fill />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider>
            </View>
            <Button
              isIconOnly
              size="sm"
              variant="secondary"
              className="rounded-full"
              accessibilityLabel="Zoom in"
              isDisabled={!intraday.data?.length || windowMs <= MIN_WINDOW}
              onPress={() => {
                zoom(0.5);
                void Haptics.selectionAsync();
              }}
            >
              <Plus size={16} color={colors.text} />
            </Button>
          </View>
          {offset > 0 && (
            <Button
              size="sm"
              variant="tertiary"
              className="self-start rounded-full"
              onPress={() => {
                setOffset(0);
                void Haptics.selectionAsync();
              }}
            >
              <Button.Label>Return to latest</Button.Label>
            </Button>
          )}
        </View>
      )}
      <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 18, height: 2, backgroundColor: colors.blue }} />
            <Type style={{ fontSize: 11, color: colors.muted }}>
              Recorded · {query.data?.length ?? 0}{' '}
              {(query.data?.length ?? 0) === 1 ? 'observation' : 'observations'}
            </Type>
          </View>
          {projecting && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 18,
                  borderTopWidth: 2,
                  borderColor: colors.projection,
                  borderStyle: 'dashed',
                }}
              />
              <Type style={{ fontSize: 11, color: colors.amber }}>Projected</Type>
            </View>
          )}
        </View>
        {range === '3H' && (
          <Type style={{ fontSize: 11, lineHeight: 17, color: colors.muted }}>
            Lines interpolate between recorded estimates. Dashed projections extend the last
            intraday trend for up to 15 minutes; second-by-second changes are not market quotes.
          </Type>
        )}
        {projecting && (
          <Type style={{ fontSize: 11, color: colors.muted }}>
            Extra decimal places show model movement, not valuation accuracy.
          </Type>
        )}
      </View>
    </Panel>
  );
}
