import { BlurMask, Canvas, Circle, Group, Path } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, useTapGesture } from 'react-native-gesture-handler';
import {
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { COLORS, DONUT_PALETTE, SPACING, TYPOGRAPHY } from '../theme/tokens';
import { formatPercent } from '../utils/format';
import { AmountText } from './AmountText';

export interface DonutSlice {
  id: string;
  name: string;
  amount: number;
  percent: number;
  color?: string;
}

export type DonutCategorySlice = DonutSlice;

export interface DonutChartProps {
  slices: DonutSlice[];
  totalExpense: number;
  selectedCategoryId?: string | null;
  onSelectCategory?: (categoryId: string | null) => void;
  testID?: string;
}

interface ArcGeometry {
  slice: DonutSlice;
  color: string;
  pathD: string;
  startRelDeg: number;
  endRelDeg: number;
  startFraction: number;
  endFraction: number;
}

const CANVAS_SIZE = 214;
const CENTER = CANVAS_SIZE / 2;
const RING_RADIUS = 78;
const STROKE_BASE = 16;
const STROKE_ACTIVE = 21;

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const rad = (angleInDegrees * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function buildArcPath(cx: number, cy: number, radius: number, startDeg: number, sweepDeg: number): string {
  const clampedSweep = Math.min(Math.max(sweepDeg, 0.8), 359.2);
  const start = polarToCartesian(cx, cy, radius, startDeg);
  const end = polarToCartesian(cx, cy, radius, startDeg + clampedSweep);
  const largeArcFlag = clampedSweep > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

interface SkiaSliceArcProps {
  arc: ArcGeometry;
  isSelected: boolean;
  hasSelection: boolean;
  sweepProgress: SharedValue<number>;
}

const SkiaSliceArc = React.memo(function SkiaSliceArc({
  arc,
  isSelected,
  hasSelection,
  sweepProgress,
}: SkiaSliceArcProps) {
  const arcEnd = useDerivedValue(() => {
    const p = sweepProgress.get();
    const span = Math.max(arc.endFraction - arc.startFraction, 0.0001);
    const local = (p - arc.startFraction) / span;
    return Math.min(Math.max(local, 0), 1);
  });

  const strokeWidth = isSelected ? STROKE_ACTIVE : STROKE_BASE;
  const opacity = hasSelection ? (isSelected ? 1 : 0.34) : 0.96;

  return (
    <Group opacity={opacity}>
      <Path
        path={arc.pathD}
        style="stroke"
        strokeWidth={isSelected ? STROKE_ACTIVE + 6 : STROKE_BASE + 2}
        strokeCap="round"
        color={arc.color}
        start={0}
        end={arcEnd}
        opacity={isSelected ? 0.36 : 0.16}
      >
        <BlurMask blur={isSelected ? 10 : 5} style="normal" />
      </Path>
      <Path
        path={arc.pathD}
        style="stroke"
        strokeWidth={strokeWidth}
        strokeCap="round"
        color={arc.color}
        start={0}
        end={arcEnd}
      />
    </Group>
  );
});

/**
 * Gráfico donut interativo em GPU Skia com animação fluida de varredura Reanimated,
 * pontas arredondadas, halo luminoso por categoria e toque direto nas fatias ou legenda.
 */
function DonutChartImpl({
  slices,
  totalExpense,
  selectedCategoryId = null,
  onSelectCategory,
  testID,
}: DonutChartProps) {
  const reducedMotion = useReducedMotion();
  const sweepProgress = useSharedValue(reducedMotion ? 1 : 0);

  const validSlices = useMemo(
    () => slices.filter((s) => s.amount > 0),
    [slices],
  );

  const dataSignature = useMemo(
    () => validSlices.map((s) => `${s.id}:${Math.round(s.amount * 100)}`).join('|'),
    [validSlices],
  );

  useEffect(() => {
    if (reducedMotion) {
      sweepProgress.set(1);
      return;
    }
    sweepProgress.set(0);
    sweepProgress.set(
      withTiming(1, {
        duration: 720,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [dataSignature, reducedMotion, sweepProgress]);

  const arcs = useMemo<ArcGeometry[]>(() => {
    if (validSlices.length === 0) return [];

    const sumPercent = validSlices.reduce((acc, s) => acc + Math.max(s.percent, 0), 0);
    const normFactor = sumPercent > 0 ? 100 / sumPercent : 1;
    const gapDeg = validSlices.length > 1 ? 5.0 : 0;

    let cursorDeg = 0;
    return validSlices.map((slice, idx) => {
      const sliceColor = slice.color ?? DONUT_PALETTE[idx % DONUT_PALETTE.length];
      const normalizedPct = Math.max(slice.percent, 0) * normFactor;
      const sliceDeg = (normalizedPct / 100) * 360;
      const startRelDeg = cursorDeg + gapDeg * 0.5;
      const sweepDeg = Math.max(3.0, sliceDeg - gapDeg);
      const startFraction = cursorDeg / 360;
      const endFraction = Math.min(1, (cursorDeg + sliceDeg) / 360);
      cursorDeg += sliceDeg;

      return {
        slice,
        color: sliceColor,
        pathD: buildArcPath(CENTER, CENTER, RING_RADIUS, startRelDeg - 90, sweepDeg),
        startRelDeg,
        endRelDeg: startRelDeg + sweepDeg,
        startFraction,
        endFraction,
      };
    });
  }, [validSlices]);

  const handleToggle = useCallback(
    (categoryId: string) => {
      if (!onSelectCategory) return;
      void Haptics.selectionAsync().catch(() => undefined);
      onSelectCategory(selectedCategoryId === categoryId ? null : categoryId);
    },
    [onSelectCategory, selectedCategoryId],
  );

  const handleCanvasTap = useCallback(
    (x: number, y: number) => {
      if (!onSelectCategory || arcs.length === 0) return;
      const dx = x - CENTER;
      const dy = y - CENTER;
      const dist = Math.hypot(dx, dy);

      if (dist < RING_RADIUS - 26) {
        if (selectedCategoryId) {
          void Haptics.selectionAsync().catch(() => undefined);
          onSelectCategory(null);
        }
        return;
      }

      if (dist <= RING_RADIUS + 28) {
        const degFromTop = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
        const hit = arcs.find((a) => degFromTop >= a.startRelDeg && degFromTop <= a.endRelDeg);
        if (hit) {
          handleToggle(hit.slice.id);
          return;
        }
      }

      if (selectedCategoryId) {
        void Haptics.selectionAsync().catch(() => undefined);
        onSelectCategory(null);
      }
    },
    [arcs, handleToggle, onSelectCategory, selectedCategoryId],
  );

  const ringTap = useTapGesture({
    maxDuration: 260,
    onDeactivate: (event) => {
      'worklet';
      scheduleOnRN(handleCanvasTap, event.x, event.y);
    },
  });

  if (validSlices.length === 0 || totalExpense <= 0) {
    return (
      <View style={styles.emptyWrap} testID={testID ?? 'donut-empty'}>
        <View style={styles.emptyRing}>
          <Text style={styles.emptyTitle}>Sem despesas</Text>
          <Text style={styles.emptySub}>neste mês</Text>
        </View>
      </View>
    );
  }

  const activeArc = selectedCategoryId
    ? arcs.find((a) => a.slice.id === selectedCategoryId) ?? null
    : null;
  const activeSlice = activeArc?.slice ?? null;
  const hasSelection = activeSlice !== null;

  const clearSelectionIfSelected = () => {
    if (selectedCategoryId && onSelectCategory) {
      void Haptics.selectionAsync().catch(() => undefined);
      onSelectCategory(null);
    }
  };

  return (
    <View
      style={styles.wrapper}
      onTouchEnd={(e) => {
        if (e.target === e.currentTarget) {
          clearSelectionIfSelected();
        }
      }}
      testID={testID}
    >
      <View
        style={styles.chartBox}
        onTouchEnd={(e) => {
          if (e.target === e.currentTarget) {
            clearSelectionIfSelected();
          }
        }}
      >
        <GestureDetector gesture={ringTap}>
          <View style={styles.canvasWrap}>
            <Canvas style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}>
              <Circle
                cx={CENTER}
                cy={CENTER}
                r={RING_RADIUS}
                style="stroke"
                strokeWidth={STROKE_BASE}
                color="rgba(255, 255, 255, 0.06)"
              />
              {arcs.map((arc) => (
                <SkiaSliceArc
                  key={arc.slice.id}
                  arc={arc}
                  isSelected={selectedCategoryId === arc.slice.id}
                  hasSelection={hasSelection}
                  sweepProgress={sweepProgress}
                />
              ))}
            </Canvas>

            <View pointerEvents="none" style={styles.centerLabel}>
              {activeSlice && activeArc ? (
                <View style={styles.centerBadgeRow}>
                  <View style={[styles.centerBadgeDot, { backgroundColor: activeArc.color }]} />
                  <Text style={styles.centerTitle} numberOfLines={1}>
                    {activeSlice.name}
                  </Text>
                </View>
              ) : (
                <Text style={styles.centerTitle} numberOfLines={1}>
                  Total gasto
                </Text>
              )}

              <AmountText
                value={activeSlice ? activeSlice.amount : totalExpense}
                size={18}
                weight="bold"
                tone="neutral"
                style={styles.centerAmount}
              />

              {activeSlice ? (
                <View style={styles.centerPctPill}>
                  <Text style={styles.centerPct}>{formatPercent(activeSlice.percent)}</Text>
                </View>
              ) : (
                <Text style={styles.centerCount}>
                  {`${validSlices.length} ${validSlices.length === 1 ? 'grupo' : 'grupos'}`}
                </Text>
              )}
            </View>
          </View>
        </GestureDetector>
      </View>

      <View style={styles.legendList}>
        {arcs.map((arc) => {
          const { slice, color } = arc;
          const isSelected = selectedCategoryId === slice.id;
          const isDimmed = hasSelection && !isSelected;

          return (
            <Pressable
              key={slice.id}
              onPress={() => handleToggle(slice.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              testID={`donut-legend-${slice.id}`}
              style={({ pressed }) => [
                styles.legendItem,
                isSelected ? styles.legendItemSelected : null,
                isSelected ? { borderColor: `${color}66` } : null,
                isDimmed ? styles.legendItemDimmed : null,
                pressed ? styles.legendItemPressed : null,
              ]}
            >
              <View style={styles.legendLeft}>
                <View style={[styles.colorRing, { borderColor: `${color}44` }]}>
                  <View style={[styles.colorDot, { backgroundColor: color }]} />
                </View>
                <Text style={styles.legendName} numberOfLines={1}>
                  {slice.name}
                </Text>
              </View>

              <View style={styles.legendRight}>
                <View style={styles.percentPill}>
                  <Text style={styles.legendPercent}>{formatPercent(slice.percent)}</Text>
                </View>
                <AmountText
                  value={slice.amount}
                  size={TYPOGRAPHY.size.caption}
                  weight="semibold"
                  tone="neutral"
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const DonutChart = React.memo(DonutChartImpl);

const styles = StyleSheet.create({
  wrapper: {
    gap: SPACING.md + 2,
  },
  chartBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xs,
  },
  canvasWrap: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  centerLabel: {
    position: 'absolute',
    width: 122,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  centerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 118,
  },
  centerBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  centerTitle: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.micro,
    textAlign: 'center',
  },
  centerAmount: {
    fontSize: 18,
    lineHeight: 24,
  },
  centerCount: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: 11,
  },
  centerPctPill: {
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
  },
  centerPct: {
    color: COLORS.accent.ice,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyRing: {
    width: 164,
    height: 164,
    borderRadius: 82,
    borderWidth: 14,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.caption,
  },
  emptySub: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
  },
  legendList: {
    gap: SPACING.xs + 2,
  },
  legendItem: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 3,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  legendItemSelected: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  legendItemDimmed: {
    opacity: 0.48,
  },
  legendItemPressed: {
    opacity: 0.78,
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    flex: 1,
    minWidth: 0,
  },
  colorRing: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendName: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
    flex: 1,
  },
  legendRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  percentPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  legendPercent: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});
