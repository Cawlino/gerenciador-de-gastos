import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { COLORS, DONUT_PALETTE, GLASS_METRICS, SPACING, TYPOGRAPHY } from '../theme/tokens';
import { formatBRL, formatPercent } from '../utils/format';
import { AmountText } from './AmountText';

export interface DonutCategorySlice {
  id: string;
  name: string;
  amount: number;
  percent: number;
  color?: string;
}

export interface DonutChartProps {
  slices: DonutCategorySlice[];
  totalExpense: number;
  selectedCategoryId?: string | null;
  onSelectCategory?: (categoryId: string | null) => void;
  radius?: number;
  innerRadius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Gráfico donut de gastos por categoria com rótulo central e legenda em 2 colunas.
 */
export function DonutChart({
  slices,
  totalExpense,
  selectedCategoryId = null,
  onSelectCategory,
  radius = 96,
  innerRadius = 64,
  style,
  testID,
}: DonutChartProps) {
  const validSlices = slices.filter((s) => s.amount > 0);
  const hasData = validSlices.length > 0 && totalExpense > 0;

  const toggleCategory = (categoryId: string) => {
    if (!onSelectCategory) return;
    onSelectCategory(selectedCategoryId === categoryId ? null : categoryId);
  };

  const chartData = validSlices.map((slice, index) => {
    const color = slice.color ?? DONUT_PALETTE[index % DONUT_PALETTE.length];
    return {
      value: slice.amount,
      color,
      focused: selectedCategoryId === slice.id,
      onPress: () => toggleCategory(slice.id),
    };
  });

  const activeSlice = selectedCategoryId
    ? validSlices.find((s) => s.id === selectedCategoryId) ?? null
    : null;

  return (
    <View style={[styles.container, style]} testID={testID}>
      <View style={styles.chartWrap}>
        {hasData ? (
          <PieChart
            donut
            data={chartData}
            radius={radius}
            innerRadius={innerRadius}
            innerCircleColor={COLORS.bg.mid}
            strokeWidth={2}
            strokeColor={COLORS.bg.deep}
            focusOnPress={Boolean(onSelectCategory)}
            toggleFocusOnPress={Boolean(onSelectCategory)}
            isAnimated={false}
            centerLabelComponent={() => (
              <View style={styles.centerContent}>
                <Text style={styles.centerLabel} numberOfLines={1}>
                  {activeSlice ? activeSlice.name : 'Total gasto'}
                </Text>
                <AmountText
                  value={activeSlice ? activeSlice.amount : totalExpense}
                  absolute
                  tone="neutral"
                  size={TYPOGRAPHY.size.section}
                  weight="bold"
                />
                {activeSlice ? (
                  <Text style={styles.centerPercent}>{formatPercent(activeSlice.percent)}</Text>
                ) : null}
              </View>
            )}
          />
        ) : (
          <View
            style={[
              styles.emptyRing,
              { width: radius * 2, height: radius * 2, borderRadius: radius },
            ]}
            testID="donut-empty"
          >
            <Text style={styles.emptyTitle}>Sem gastos</Text>
            <Text style={styles.emptySubtitle}>R$ 0,00</Text>
          </View>
        )}
      </View>

      {hasData ? (
        <View style={styles.legendGrid}>
          {validSlices.map((slice, index) => {
            const color = slice.color ?? DONUT_PALETTE[index % DONUT_PALETTE.length];
            const isSelected = selectedCategoryId === slice.id;

            return (
              <Pressable
                key={slice.id}
                onPress={() => toggleCategory(slice.id)}
                disabled={!onSelectCategory}
                accessibilityRole={onSelectCategory ? 'button' : 'text'}
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${slice.name}: ${formatPercent(slice.percent)}`}
                testID={`donut-legend-${slice.id}`}
                style={[
                  styles.legendItem,
                  isSelected
                    ? {
                        borderColor: `${color}88`,
                        backgroundColor: `${color}18`,
                      }
                    : null,
                ]}
              >
                <View style={styles.legendTop}>
                  <View style={[styles.dot, { backgroundColor: color }]} />
                  <Text style={styles.legendName} numberOfLines={1}>
                    {slice.name}
                  </Text>
                </View>
                <View style={styles.legendBottom}>
                  <Text style={styles.legendValue}>{formatBRL(slice.amount, { absolute: true })}</Text>
                  <Text style={[styles.legendPercent, { color }]}>
                    {formatPercent(slice.percent)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: SPACING.lg,
  },
  chartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xs,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    gap: 2,
  },
  centerLabel: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.micro,
    maxWidth: 104,
    textAlign: 'center',
  },
  centerPercent: {
    color: COLORS.neon.cyan,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.micro,
  },
  emptyRing: {
    borderWidth: 16,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  emptyTitle: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  emptySubtitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.body,
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  legendItem: {
    width: '48.5%',
    borderRadius: GLASS_METRICS.radius.row - 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    gap: 4,
  },
  legendTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  legendName: {
    flex: 1,
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  legendBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  legendValue: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
    fontVariant: ['tabular-nums'],
  },
  legendPercent: {
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.micro,
    fontVariant: ['tabular-nums'],
  },
});
