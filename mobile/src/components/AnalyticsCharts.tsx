import {
  BlurMask,
  Canvas,
  Circle,
  LinearGradient,
  Path,
  Rect,
  RoundedRect,
  vec,
} from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Easing,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme/tokens';
import type {
  AccountBalancePoint,
  CategoryComparisonItem,
  DailyPaceComparison,
  HabitsBreakdown,
  IncomeExpensePoint,
  WaterfallStep,
} from '../utils/analyticsHelpers';
import { formatPercent } from '../utils/format';
import { AmountText } from './AmountText';

function buildSmoothCurvePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = ((p0.x + p1.x) / 2).toFixed(1);
    d += ` C ${cx} ${p0.y.toFixed(1)}, ${cx} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

function buildPolylinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  return points
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');
}

function useChartSweep(signature: string) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(
      withTiming(1, {
        duration: 650,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [progress, reducedMotion, signature]);

  return progress;
}

function useContainerWidth(initial = 320): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(initial);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 40 && Math.abs(w - width) > 2) {
      setWidth(w);
    }
  };
  return [width, onLayout];
}

// ---------------------------------------------------------------------------
// 1. Evolução do Dinheiro em Conta (Area + Cubic Bézier Line Chart em Skia)
// ---------------------------------------------------------------------------

export interface BalanceAreaChartProps {
  series: AccountBalancePoint[];
  testID?: string;
}

export const BalanceAreaChart = React.memo(function BalanceAreaChart({
  series,
  testID = 'analytics-balance-area-chart',
}: BalanceAreaChartProps) {
  const [width, onLayout] = useContainerWidth(320);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const chartHeight = 164;
  const padX = 12;
  const padTop = 18;
  const padBottom = 18;

  const activeIdx =
    selectedIndex !== null && selectedIndex < series.length
      ? selectedIndex
      : Math.max(series.length - 1, 0);
  const activePoint = series[activeIdx];

  const signature = useMemo(
    () => series.map((p) => `${p.month}:${Math.round(p.endingBalance)}`).join('|'),
    [series],
  );
  const drawProgress = useChartSweep(signature);

  const geometry = useMemo(() => {
    if (series.length === 0) return null;
    const allValues = series.flatMap((p) => [p.endingBalance, p.movingAvg3M]);
    const minRaw = Math.min(...allValues);
    const maxRaw = Math.max(...allValues);
    const span = Math.max(maxRaw - minRaw, 100);
    const minVal = Math.max(0, minRaw - span * 0.12);
    const maxVal = maxRaw + span * 0.12;
    const plotW = Math.max(width - padX * 2, 40);
    const plotH = chartHeight - padTop - padBottom;

    const balancePts = series.map((p, i) => {
      const x =
        series.length === 1 ? padX + plotW / 2 : padX + (i / (series.length - 1)) * plotW;
      const ratio = (p.endingBalance - minVal) / Math.max(maxVal - minVal, 1);
      const y = padTop + plotH - ratio * plotH;
      return { x, y };
    });

    const avgPts = series.map((p, i) => {
      const x =
        series.length === 1 ? padX + plotW / 2 : padX + (i / (series.length - 1)) * plotW;
      const ratio = (p.movingAvg3M - minVal) / Math.max(maxVal - minVal, 1);
      const y = padTop + plotH - ratio * plotH;
      return { x, y };
    });

    const linePath = buildSmoothCurvePath(balancePts);
    const avgPath = buildSmoothCurvePath(avgPts);
    const lastPt = balancePts[balancePts.length - 1];
    const firstPt = balancePts[0];
    const baselineY = padTop + plotH;
    const areaPath =
      linePath && firstPt && lastPt
        ? `${linePath} L ${lastPt.x.toFixed(1)} ${baselineY.toFixed(1)} L ${firstPt.x.toFixed(1)} ${baselineY.toFixed(1)} Z`
        : '';

    return { balancePts, linePath, avgPath, areaPath, baselineY };
  }, [series, width]);

  if (series.length === 0 || !geometry) {
    return (
      <View style={styles.emptyBox} testID={testID}>
        <Text style={styles.emptyText}>Sem histórico de saldo para o período.</Text>
      </View>
    );
  }

  const labelStep = series.length > 6 ? 2 : 1;

  return (
    <View style={styles.chartWrap} onLayout={onLayout} testID={testID}>
      {activePoint ? (
        <View style={styles.inspectRow}>
          <View style={styles.inspectBlock}>
            <Text style={styles.inspectLabel}>{`Saldo em ${activePoint.label}`}</Text>
            <AmountText
              value={activePoint.endingBalance}
              tone="neutral"
              size={TYPOGRAPHY.size.section}
              weight="bold"
              testID={`${testID}-active-value`}
            />
          </View>
          <View style={styles.inspectBlockRight}>
            <Text style={styles.inspectLabel}>Média móvel 3M</Text>
            <AmountText
              value={activePoint.movingAvg3M}
              tone="neutral"
              size={TYPOGRAPHY.size.caption}
              weight="semibold"
            />
          </View>
        </View>
      ) : null}

      <Canvas style={{ width, height: chartHeight }}>
        {[0.25, 0.5, 0.75].map((frac) => {
          const y = padTop + (chartHeight - padTop - padBottom) * frac;
          return (
            <Path
              key={frac}
              path={`M ${padX} ${y.toFixed(1)} L ${(width - padX).toFixed(1)} ${y.toFixed(1)}`}
              style="stroke"
              strokeWidth={1}
              color="rgba(255, 255, 255, 0.06)"
            />
          );
        })}

        {geometry.areaPath ? (
          <Path path={geometry.areaPath} style="fill">
            <LinearGradient
              start={vec(0, padTop)}
              end={vec(0, geometry.baselineY)}
              colors={['rgba(56, 189, 248, 0.34)', 'rgba(37, 99, 235, 0.02)']}
            />
          </Path>
        ) : null}

        {geometry.avgPath ? (
          <Path
            path={geometry.avgPath}
            style="stroke"
            strokeWidth={1.6}
            strokeCap="round"
            color="rgba(168, 85, 247, 0.7)"
            start={0}
            end={drawProgress}
          />
        ) : null}

        {geometry.linePath ? (
          <>
            <Path
              path={geometry.linePath}
              style="stroke"
              strokeWidth={6}
              strokeCap="round"
              color="rgba(56, 189, 248, 0.28)"
              start={0}
              end={drawProgress}
            >
              <BlurMask blur={6} style="normal" />
            </Path>
            <Path
              path={geometry.linePath}
              style="stroke"
              strokeWidth={2.6}
              strokeCap="round"
              color={COLORS.accent.ice}
              start={0}
              end={drawProgress}
            />
          </>
        ) : null}

        {geometry.balancePts.map((pt, idx) => {
          const isActive = idx === activeIdx;
          return (
            <React.Fragment key={series[idx].month}>
              {isActive ? (
                <Circle cx={pt.x} cy={pt.y} r={9} color="rgba(56, 189, 248, 0.25)" />
              ) : null}
              <Circle
                cx={pt.x}
                cy={pt.y}
                r={isActive ? 4.5 : 2.6}
                color={isActive ? '#E0F2FE' : COLORS.accent.ice}
              />
            </React.Fragment>
          );
        })}
      </Canvas>

      <View style={styles.axisRow}>
        {series.map((pt, idx) => {
          const isActive = idx === activeIdx;
          const showLabel = isActive || idx === series.length - 1 || idx % labelStep === 0;
          return (
            <Pressable
              key={pt.month}
              onPress={() => {
                void Haptics.selectionAsync().catch(() => undefined);
                setSelectedIndex(idx);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Selecionar mês ${pt.label}`}
              testID={`${testID}-point-${pt.month}`}
              style={[styles.axisTouchChip, isActive ? styles.axisTouchChipActive : null]}
            >
              <Text
                style={[
                  styles.axisText,
                  isActive ? styles.axisTextActive : null,
                  !showLabel ? styles.axisTextMuted : null,
                ]}
                numberOfLines={1}
              >
                {showLabel ? pt.label.split('/')[0] : '·'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legendInlineRow}>
        <View style={styles.legendDotItem}>
          <View style={[styles.smallDot, { backgroundColor: COLORS.accent.ice }]} />
          <Text style={styles.legendTinyText}>Saldo em conta</Text>
        </View>
        <View style={styles.legendDotItem}>
          <View style={[styles.smallDot, { backgroundColor: COLORS.neon.purple }]} />
          <Text style={styles.legendTinyText}>Média móvel 3M</Text>
        </View>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// 2. Combo Barras + Linha: Ganhos vs. Gastos & Sobra Líquida
// ---------------------------------------------------------------------------

export interface IncomeExpenseComboChartProps {
  series: IncomeExpensePoint[];
  testID?: string;
}

export const IncomeExpenseComboChart = React.memo(function IncomeExpenseComboChart({
  series,
  testID = 'analytics-income-expense-chart',
}: IncomeExpenseComboChartProps) {
  const [width, onLayout] = useContainerWidth(320);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const chartHeight = 172;
  const padX = 10;
  const padTop = 14;
  const padBottom = 16;

  const activeIdx =
    selectedIndex !== null && selectedIndex < series.length
      ? selectedIndex
      : Math.max(series.length - 1, 0);
  const activePoint = series[activeIdx];

  const signature = useMemo(
    () =>
      series
        .map((p) => `${p.month}:${Math.round(p.income)}:${Math.round(p.expense)}`)
        .join('|'),
    [series],
  );
  const drawProgress = useChartSweep(signature);

  const geometry = useMemo(() => {
    if (series.length === 0) return null;
    const maxVal = Math.max(
      ...series.flatMap((p) => [p.income, p.expense, Math.abs(p.net)]),
      100,
    );
    const plotW = Math.max(width - padX * 2, 40);
    const plotH = chartHeight - padTop - padBottom;
    const slotW = plotW / series.length;
    const barW = Math.max(4, Math.min(13, slotW * 0.34));
    const baselineY = padTop + plotH;

    const bars = series.map((p, idx) => {
      const centerX = padX + slotW * (idx + 0.5);
      const incH = Math.max(2, (p.income / maxVal) * plotH);
      const expH = Math.max(2, (p.expense / maxVal) * plotH);
      const netClamped = Math.max(0, p.net);
      const netY = baselineY - (netClamped / maxVal) * plotH;
      return {
        month: p.month,
        centerX,
        incX: centerX - barW - 1.5,
        incY: baselineY - incH,
        incH,
        expX: centerX + 1.5,
        expY: baselineY - expH,
        expH,
        barW,
        netY,
      };
    });

    const netLinePath = buildSmoothCurvePath(
      bars.map((b) => ({ x: b.centerX, y: b.netY })),
    );

    return { bars, netLinePath, baselineY };
  }, [series, width]);

  if (series.length === 0 || !geometry) {
    return (
      <View style={styles.emptyBox} testID={testID}>
        <Text style={styles.emptyText}>Sem dados comparativos de ganhos e gastos.</Text>
      </View>
    );
  }

  return (
    <View style={styles.chartWrap} onLayout={onLayout} testID={testID}>
      {activePoint ? (
        <View style={styles.comboInspectGrid}>
          <View style={styles.comboInspectPill}>
            <Text style={styles.inspectLabel}>{`Ganhos (${activePoint.label})`}</Text>
            <AmountText
              value={activePoint.income}
              tone="income"
              size={TYPOGRAPHY.size.caption}
              weight="bold"
            />
          </View>
          <View style={styles.comboInspectPill}>
            <Text style={styles.inspectLabel}>Gastos</Text>
            <AmountText
              value={-Math.abs(activePoint.expense)}
              signed
              tone="expense"
              size={TYPOGRAPHY.size.caption}
              weight="bold"
            />
          </View>
          <View style={styles.comboInspectPill}>
            <Text style={styles.inspectLabel}>Poupança</Text>
            <Text style={styles.comboPctValue}>{formatPercent(activePoint.savingsRatePct)}</Text>
          </View>
        </View>
      ) : null}

      <Canvas style={{ width, height: chartHeight }}>
        <Path
          path={`M ${padX} ${geometry.baselineY.toFixed(1)} L ${(width - padX).toFixed(1)} ${geometry.baselineY.toFixed(1)}`}
          style="stroke"
          strokeWidth={1}
          color="rgba(255, 255, 255, 0.1)"
        />

        {geometry.bars.map((b, idx) => {
          const isActive = idx === activeIdx;
          const opacity = isActive ? 1 : 0.72;
          return (
            <React.Fragment key={b.month}>
              <RoundedRect
                x={b.incX}
                y={b.incY}
                width={b.barW}
                height={b.incH}
                r={3}
                color={COLORS.semantic.income}
                opacity={opacity}
              />
              <RoundedRect
                x={b.expX}
                y={b.expY}
                width={b.barW}
                height={b.expH}
                r={3}
                color={COLORS.semantic.expense}
                opacity={opacity}
              />
            </React.Fragment>
          );
        })}

        {geometry.netLinePath ? (
          <Path
            path={geometry.netLinePath}
            style="stroke"
            strokeWidth={2.2}
            strokeCap="round"
            color={COLORS.accent.ice}
            start={0}
            end={drawProgress}
          />
        ) : null}

        {geometry.bars.map((b, idx) => (
          <Circle
            key={`net-${b.month}`}
            cx={b.centerX}
            cy={b.netY}
            r={idx === activeIdx ? 4 : 2.3}
            color={idx === activeIdx ? '#E0F2FE' : COLORS.accent.ice}
          />
        ))}
      </Canvas>

      <View style={styles.axisRow}>
        {series.map((pt, idx) => {
          const isActive = idx === activeIdx;
          const showLabel =
            series.length <= 6 || isActive || idx === series.length - 1 || idx % 2 === 0;
          return (
            <Pressable
              key={pt.month}
              onPress={() => {
                void Haptics.selectionAsync().catch(() => undefined);
                setSelectedIndex(idx);
              }}
              accessibilityRole="button"
              testID={`${testID}-bar-${pt.month}`}
              style={[styles.axisTouchChip, isActive ? styles.axisTouchChipActive : null]}
            >
              <Text
                style={[styles.axisText, isActive ? styles.axisTextActive : null]}
                numberOfLines={1}
              >
                {showLabel ? pt.label.split('/')[0] : '·'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legendInlineRow}>
        <View style={styles.legendDotItem}>
          <View style={[styles.smallDot, { backgroundColor: COLORS.semantic.income }]} />
          <Text style={styles.legendTinyText}>Ganhos</Text>
        </View>
        <View style={styles.legendDotItem}>
          <View style={[styles.smallDot, { backgroundColor: COLORS.semantic.expense }]} />
          <Text style={styles.legendTinyText}>Gastos</Text>
        </View>
        <View style={styles.legendDotItem}>
          <View style={[styles.smallDot, { backgroundColor: COLORS.accent.ice }]} />
          <Text style={styles.legendTinyText}>Sobra líquida</Text>
        </View>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// 3. Curva de Ritmo Diário ("Spending Pace" dia 1..30)
// ---------------------------------------------------------------------------

export interface SpendingPaceChartProps {
  pace: DailyPaceComparison;
  testID?: string;
}

export const SpendingPaceChart = React.memo(function SpendingPaceChart({
  pace,
  testID = 'analytics-spending-pace-chart',
}: SpendingPaceChartProps) {
  const [width, onLayout] = useContainerWidth(320);
  const chartHeight = 152;
  const padX = 12;
  const padTop = 14;
  const padBottom = 14;

  const drawProgress = useChartSweep(
    `${pace.month}:${Math.round(pace.currentTotalAtDay)}:${Math.round(pace.previousTotalAtDay)}`,
  );

  const geometry = useMemo(() => {
    const maxVal = Math.max(
      ...pace.currentSeries,
      ...pace.previousSeries,
      100,
    );
    const plotW = Math.max(width - padX * 2, 40);
    const plotH = chartHeight - padTop - padBottom;
    const totalDays = Math.max(pace.daysInMonth - 1, 1);

    const prevPts = pace.previousSeries.map((val, idx) => ({
      x: padX + (idx / totalDays) * plotW,
      y: padTop + plotH - (val / maxVal) * plotH,
    }));
    const curPts = pace.currentSeries.map((val, idx) => ({
      x: padX + (idx / totalDays) * plotW,
      y: padTop + plotH - (val / maxVal) * plotH,
    }));

    const prevPath = buildPolylinePath(prevPts);
    const curPath = buildPolylinePath(curPts);
    const curLast = curPts[curPts.length - 1];
    const baselineY = padTop + plotH;
    const curArea =
      curPath && curPts.length > 1 && curLast
        ? `${curPath} L ${curLast.x.toFixed(1)} ${baselineY.toFixed(1)} L ${curPts[0].x.toFixed(1)} ${baselineY.toFixed(1)} Z`
        : '';

    return { prevPath, curPath, curArea, curLast, baselineY };
  }, [pace, width]);

  const statusTone =
    pace.status === 'below'
      ? COLORS.semantic.income
      : pace.status === 'above'
        ? COLORS.semantic.expense
        : COLORS.accent.ice;
  const statusLabel =
    pace.status === 'below'
      ? `${formatPercent(Math.abs(pace.deltaPct))} abaixo do mês anterior`
      : pace.status === 'above'
        ? `${formatPercent(pace.deltaPct)} acima do mês anterior`
        : 'Ritmo em linha com mês anterior';

  return (
    <View style={styles.chartWrap} onLayout={onLayout} testID={testID}>
      <View style={styles.inspectRow}>
        <View style={styles.inspectBlock}>
          <Text style={styles.inspectLabel}>{`Acumulado até dia ${pace.elapsedDays}`}</Text>
          <AmountText
            value={pace.currentTotalAtDay}
            tone="neutral"
            size={TYPOGRAPHY.size.section}
            weight="bold"
          />
        </View>
        <View style={[styles.paceStatusPill, { borderColor: `${statusTone}55` }]}>
          <Text style={[styles.paceStatusText, { color: statusTone }]}>{statusLabel}</Text>
        </View>
      </View>

      <Canvas style={{ width, height: chartHeight }}>
        <Path
          path={`M ${padX} ${geometry.baselineY.toFixed(1)} L ${(width - padX).toFixed(1)} ${geometry.baselineY.toFixed(1)}`}
          style="stroke"
          strokeWidth={1}
          color="rgba(255, 255, 255, 0.08)"
        />

        {geometry.prevPath ? (
          <Path
            path={geometry.prevPath}
            style="stroke"
            strokeWidth={1.8}
            strokeCap="round"
            color="rgba(148, 163, 184, 0.55)"
          />
        ) : null}

        {geometry.curArea ? (
          <Path path={geometry.curArea} style="fill">
            <LinearGradient
              start={vec(0, padTop)}
              end={vec(0, geometry.baselineY)}
              colors={[
                pace.status === 'above'
                  ? 'rgba(251, 113, 133, 0.28)'
                  : 'rgba(52, 211, 153, 0.26)',
                'rgba(15, 23, 42, 0.01)',
              ]}
            />
          </Path>
        ) : null}

        {geometry.curPath ? (
          <Path
            path={geometry.curPath}
            style="stroke"
            strokeWidth={2.6}
            strokeCap="round"
            color={statusTone}
            start={0}
            end={drawProgress}
          />
        ) : null}

        {geometry.curLast ? (
          <>
            <Circle cx={geometry.curLast.x} cy={geometry.curLast.y} r={8} color={`${statusTone}33`} />
            <Circle cx={geometry.curLast.x} cy={geometry.curLast.y} r={4} color={statusTone} />
          </>
        ) : null}
      </Canvas>

      <View style={styles.paceAxisRow}>
        <Text style={styles.axisText}>Dia 1</Text>
        <Text style={styles.axisText}>{`Dia ${Math.round(pace.daysInMonth / 2)}`}</Text>
        <Text style={styles.axisText}>{`Dia ${pace.daysInMonth}`}</Text>
      </View>

      <View style={styles.legendInlineRow}>
        <View style={styles.legendDotItem}>
          <View style={[styles.smallDot, { backgroundColor: statusTone }]} />
          <Text style={styles.legendTinyText}>Mês selecionado</Text>
        </View>
        <View style={styles.legendDotItem}>
          <View style={[styles.smallDot, { backgroundColor: 'rgba(148, 163, 184, 0.7)' }]} />
          <Text style={styles.legendTinyText}>Mês anterior (referência)</Text>
        </View>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// 4. Ponte de Fluxo de Caixa / Waterfall (Ganhos -> Categorias -> Sobra)
// ---------------------------------------------------------------------------

export interface CashFlowWaterfallChartProps {
  steps: WaterfallStep[];
  testID?: string;
}

export const CashFlowWaterfallChart = React.memo(function CashFlowWaterfallChart({
  steps,
  testID = 'analytics-waterfall-chart',
}: CashFlowWaterfallChartProps) {
  const [width, onLayout] = useContainerWidth(300);

  const maxMagnitude = useMemo(() => {
    if (steps.length === 0) return 1;
    let peak = 1;
    for (const s of steps) {
      peak = Math.max(peak, Math.abs(s.startValue), Math.abs(s.endValue), Math.abs(s.amount));
    }
    return peak;
  }, [steps]);

  if (steps.length === 0) {
    return (
      <View style={styles.emptyBox} testID={testID}>
        <Text style={styles.emptyText}>Sem movimentações para montar a ponte de caixa.</Text>
      </View>
    );
  }

  return (
    <View style={styles.waterfallWrap} onLayout={onLayout} testID={testID}>
      {steps.map((step) => {
        const minSeg = Math.min(Math.max(0, step.startValue), Math.max(0, step.endValue));
        const maxSeg = Math.max(Math.max(0, step.startValue), Math.max(0, step.endValue));
        const leftFrac = Math.min(1, Math.max(0, minSeg / maxMagnitude));
        const segFrac = Math.max(0.03, Math.min(1 - leftFrac, (maxSeg - minSeg) / maxMagnitude));
        const barAreaW = Math.max(width - 8, 80);

        return (
          <View key={step.id} style={styles.waterfallRow}>
            <View style={styles.waterfallHeader}>
              <Text style={styles.waterfallLabel} numberOfLines={1}>
                {step.label}
              </Text>
              <AmountText
                value={step.amount}
                signed
                tone={step.kind === 'income' ? 'income' : step.kind === 'expense' ? 'expense' : 'auto'}
                size={TYPOGRAPHY.size.caption}
                weight="semibold"
              />
            </View>
            <Canvas style={{ width: barAreaW, height: 12 }}>
              <RoundedRect
                x={0}
                y={2}
                width={barAreaW}
                height={8}
                r={4}
                color="rgba(255, 255, 255, 0.06)"
              />
              <RoundedRect
                x={leftFrac * barAreaW}
                y={1}
                width={Math.max(6, segFrac * barAreaW)}
                height={10}
                r={5}
                color={step.color}
              />
            </Canvas>
          </View>
        );
      })}
    </View>
  );
});

// ---------------------------------------------------------------------------
// 5. Bullet Chart Comparativo de Categorias (Atual vs. Média 12M)
// ---------------------------------------------------------------------------

export interface CategoryComparisonChartProps {
  items: CategoryComparisonItem[];
  testID?: string;
}

export const CategoryComparisonChart = React.memo(function CategoryComparisonChart({
  items,
  testID = 'analytics-category-comparison',
}: CategoryComparisonChartProps) {
  const [width, onLayout] = useContainerWidth(300);
  const topItems = useMemo(() => items.slice(0, 6), [items]);
  const maxVal = useMemo(
    () =>
      Math.max(
        ...topItems.flatMap((c) => [c.currentAmount, c.average12MAmount]),
        1,
      ),
    [topItems],
  );

  if (topItems.length === 0) {
    return (
      <View style={styles.emptyBox} testID={testID}>
        <Text style={styles.emptyText}>Nenhuma despesa categorizada para comparar.</Text>
      </View>
    );
  }

  return (
    <View style={styles.bulletList} onLayout={onLayout} testID={testID}>
      {topItems.map((cat) => {
        const barW = Math.max(width - 8, 80);
        const curRatio = Math.min(1, cat.currentAmount / maxVal);
        const avgRatio = Math.min(1, cat.average12MAmount / maxVal);
        const isHigher = cat.deltaVsAvgPct > 5;
        const isLower = cat.deltaVsAvgPct < -5;
        const deltaColor = isHigher
          ? COLORS.semantic.expense
          : isLower
            ? COLORS.semantic.income
            : COLORS.text.secondary;
        const deltaPrefix = cat.deltaVsAvgPct > 0 ? '+' : '';

        return (
          <View key={cat.categoryId} style={styles.bulletItem}>
            <View style={styles.bulletHeader}>
              <View style={styles.bulletTitleGroup}>
                <View style={[styles.smallDot, { backgroundColor: cat.color }]} />
                <Text style={styles.bulletName} numberOfLines={1}>
                  {cat.name}
                </Text>
              </View>
              <View style={styles.bulletValues}>
                <View style={[styles.deltaBadge, { borderColor: `${deltaColor}44` }]}>
                  <Text style={[styles.deltaBadgeText, { color: deltaColor }]}>
                    {`${deltaPrefix}${formatPercent(cat.deltaVsAvgPct, 0)} vs média`}
                  </Text>
                </View>
                <AmountText
                  value={cat.currentAmount}
                  tone="neutral"
                  size={TYPOGRAPHY.size.caption}
                  weight="semibold"
                />
              </View>
            </View>

            <Canvas style={{ width: barW, height: 14 }}>
              <RoundedRect
                x={0}
                y={3}
                width={barW}
                height={8}
                r={4}
                color="rgba(255, 255, 255, 0.06)"
              />
              <RoundedRect
                x={0}
                y={3}
                width={Math.max(4, curRatio * barW)}
                height={8}
                r={4}
                color={cat.color}
              />
              <Rect
                x={Math.min(barW - 3, Math.max(0, avgRatio * barW - 1.5))}
                y={0}
                width={3}
                height={14}
                color="#F8FAFC"
              />
            </Canvas>

            <View style={styles.bulletFooter}>
              <Text style={styles.bulletSubText}>{`${cat.txCount} lançamento(s)`}</Text>
              <View style={styles.bulletAvgRow}>
                <Text style={styles.bulletSubText}>Média 12M: </Text>
                <AmountText
                  value={cat.average12MAmount}
                  tone="neutral"
                  size={TYPOGRAPHY.size.micro}
                  weight="medium"
                  style={styles.bulletAvgAmount}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
});

// ---------------------------------------------------------------------------
// 6. Raio-X Canais (Conta Corrente vs. Cartão), Heatmap Semanal & Top Lojas
// ---------------------------------------------------------------------------

export interface AccountVsCardSplitChartProps {
  split: HabitsBreakdown['channelSplit'];
  testID?: string;
}

export const AccountVsCardSplitChart = React.memo(function AccountVsCardSplitChart({
  split,
  testID = 'analytics-channel-split',
}: AccountVsCardSplitChartProps) {
  const [width, onLayout] = useContainerWidth(300);
  const barW = Math.max(width, 100);
  const bankRatio = split.totalAmount > 0 ? split.checkingAmount / split.totalAmount : 0.5;
  const bankW = Math.max(6, bankRatio * barW);

  return (
    <View style={styles.chartWrap} onLayout={onLayout} testID={testID}>
      <Canvas style={{ width: barW, height: 14 }}>
        <RoundedRect
          x={0}
          y={2}
          width={barW}
          height={10}
          r={5}
          color={COLORS.neon.purple}
        />
        <RoundedRect
          x={0}
          y={2}
          width={bankW}
          height={10}
          r={5}
          color={COLORS.accent.ice}
        />
      </Canvas>

      <View style={styles.splitRow}>
        <View style={styles.splitCol}>
          <View style={styles.legendDotItem}>
            <View style={[styles.smallDot, { backgroundColor: COLORS.accent.ice }]} />
            <Text style={styles.inspectLabel}>
              {`Conta / PIX (${formatPercent(split.checkingPct, 0)})`}
            </Text>
          </View>
          <AmountText
            value={split.checkingAmount}
            tone="neutral"
            size={TYPOGRAPHY.size.body}
            weight="bold"
          />
        </View>

        <View style={styles.splitColRight}>
          <View style={styles.legendDotItem}>
            <View style={[styles.smallDot, { backgroundColor: COLORS.neon.purple }]} />
            <Text style={styles.inspectLabel}>
              {`Cartão Crédito (${formatPercent(split.creditCardPct, 0)})`}
            </Text>
          </View>
          <AmountText
            value={split.creditCardAmount}
            tone="neutral"
            size={TYPOGRAPHY.size.body}
            weight="bold"
          />
        </View>
      </View>
    </View>
  );
});

export interface WeekdayHeatmapChartProps {
  cells: HabitsBreakdown['weekdayHeatmap'];
  testID?: string;
}

export const WeekdayHeatmapChart = React.memo(function WeekdayHeatmapChart({
  cells,
  testID = 'analytics-weekday-heatmap',
}: WeekdayHeatmapChartProps) {
  const [selectedDay, setSelectedDay] = useState<number>(() => {
    let best = 0;
    cells.forEach((c, i) => {
      if (c.totalAmount > (cells[best]?.totalAmount ?? 0)) best = i;
    });
    return best;
  });

  const activeCell = cells[selectedDay] ?? cells[0];

  return (
    <View style={styles.chartWrap} testID={testID}>
      {activeCell ? (
        <View style={styles.inspectRow}>
          <Text style={styles.inspectLabel}>
            {`${activeCell.shortLabel} · ${activeCell.txCount} compra(s)`}
          </Text>
          <AmountText
            value={activeCell.totalAmount}
            tone="neutral"
            size={TYPOGRAPHY.size.caption}
            weight="bold"
          />
        </View>
      ) : null}

      <View style={styles.heatRow}>
        {cells.map((cell) => {
          const isSelected = cell.dayIndex === activeCell?.dayIndex;
          const alpha = 0.08 + cell.intensity * 0.62;
          return (
            <Pressable
              key={cell.dayIndex}
              onPress={() => {
                void Haptics.selectionAsync().catch(() => undefined);
                setSelectedDay(cell.dayIndex);
              }}
              accessibilityRole="button"
              testID={`${testID}-day-${cell.dayIndex}`}
              style={styles.heatCol}
            >
              <Canvas style={styles.heatCanvas}>
                <RoundedRect
                  x={1}
                  y={1}
                  width={34}
                  height={34}
                  r={10}
                  color={`rgba(56, 189, 248, ${alpha.toFixed(2)})`}
                />
              </Canvas>
              <Text style={[styles.heatDayLabel, isSelected ? styles.axisTextActive : null]}>
                {cell.shortLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

export interface TopMerchantsListProps {
  merchants: HabitsBreakdown['topMerchants'];
  testID?: string;
}

export const TopMerchantsList = React.memo(function TopMerchantsList({
  merchants,
  testID = 'analytics-top-merchants',
}: TopMerchantsListProps) {
  if (merchants.length === 0) {
    return (
      <View style={styles.emptyBox} testID={testID}>
        <Text style={styles.emptyText}>Sem estabelecimentos concentrados no período.</Text>
      </View>
    );
  }

  return (
    <View style={styles.merchantList} testID={testID}>
      {merchants.map((m, idx) => (
        <View key={`${m.name}-${idx}`} style={styles.merchantRow}>
          <View style={styles.merchantRankBadge}>
            <Text style={styles.merchantRankText}>{idx + 1}</Text>
          </View>
          <View style={styles.merchantMain}>
            <Text style={styles.merchantName} numberOfLines={1}>
              {m.name}
            </Text>
            <Text style={styles.merchantMeta} numberOfLines={1}>
              {`${m.categoryName} · ${m.txCount}x · ${formatPercent(m.sharePct, 0)}`}
            </Text>
          </View>
          <AmountText
            value={m.totalAmount}
            tone="neutral"
            size={TYPOGRAPHY.size.caption}
            weight="bold"
          />
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  chartWrap: {
    gap: SPACING.sm + 2,
  },
  emptyBox: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.caption,
  },
  inspectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  inspectBlock: {
    gap: 2,
  },
  inspectBlockRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  inspectLabel: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
  },
  axisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
  },
  axisTouchChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 8,
  },
  axisTouchChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
  },
  axisText: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  axisTextActive: {
    color: COLORS.accent.ice,
    fontFamily: TYPOGRAPHY.family.semibold,
  },
  axisTextMuted: {
    opacity: 0.45,
  },
  legendInlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACING.md,
    paddingTop: 2,
  },
  legendDotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendTinyText: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
  },
  comboInspectGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  comboInspectPill: {
    flex: 1,
    gap: 2,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  comboPctValue: {
    color: COLORS.accent.ice,
    fontFamily: TYPOGRAPHY.family.bold,
    fontSize: TYPOGRAPHY.size.caption,
    fontVariant: ['tabular-nums'],
  },
  paceStatusPill: {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  paceStatusText: {
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: 11,
  },
  paceAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  waterfallWrap: {
    gap: SPACING.sm + 2,
  },
  waterfallRow: {
    gap: 5,
  },
  waterfallHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  waterfallLabel: {
    flex: 1,
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  bulletList: {
    gap: SPACING.md,
  },
  bulletItem: {
    gap: 5,
  },
  bulletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  bulletTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bulletName: {
    flex: 1,
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  bulletValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
  },
  deltaBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  deltaBadgeText: {
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  bulletFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bulletSubText: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
  },
  bulletAvgRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bulletAvgAmount: {
    color: COLORS.text.secondary,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  splitCol: {
    flex: 1,
    gap: 3,
  },
  splitColRight: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 3,
  },
  heatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  heatCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  heatCanvas: {
    width: 36,
    height: 36,
  },
  heatDayLabel: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: 11,
  },
  merchantList: {
    gap: SPACING.sm,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.sm + 2,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  merchantRankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchantRankText: {
    color: COLORS.accent.ice,
    fontFamily: TYPOGRAPHY.family.bold,
    fontSize: 11,
  },
  merchantMain: {
    flex: 1,
    gap: 1,
  },
  merchantName: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  merchantMeta: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: 11,
  },
});
