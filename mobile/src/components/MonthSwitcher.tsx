import React, { useCallback, useMemo } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme/tokens';
import { formatMonthLabel, shiftYearMonth } from '../utils/format';
import { GlassCard } from './GlassCard';

export interface MonthSwitcherProps {
  month: string;
  onChange: (nextMonth: string) => void;
  minMonth?: string;
  maxMonth?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Seletor de mês em cápsula Liquid Glass com botões e suporte a deslize horizontal.
 */
export function MonthSwitcher({
  month,
  onChange,
  minMonth,
  maxMonth,
  style,
  testID,
}: MonthSwitcherProps) {
  const prevMonth = shiftYearMonth(month, -1);
  const nextMonth = shiftYearMonth(month, 1);

  const canGoPrev = !minMonth || prevMonth >= minMonth;
  const canGoNext = !maxMonth || nextMonth <= maxMonth;

  const triggerStep = useCallback(
    (delta: -1 | 1) => {
      if (delta === -1 && canGoPrev) {
        void Haptics.selectionAsync().catch(() => undefined);
        onChange(prevMonth);
      } else if (delta === 1 && canGoNext) {
        void Haptics.selectionAsync().catch(() => undefined);
        onChange(nextMonth);
      }
    },
    [canGoNext, canGoPrev, nextMonth, onChange, prevMonth],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 36) {
            triggerStep(-1);
          } else if (gesture.dx < -36) {
            triggerStep(1);
          }
        },
      }),
    [triggerStep],
  );

  return (
    <View style={style} testID={testID} {...panResponder.panHandlers}>
      <GlassCard variant="pill" padding={SPACING.xs + 2} contentStyle={styles.row}>
        <Pressable
          onPress={() => triggerStep(-1)}
          disabled={!canGoPrev}
          accessibilityRole="button"
          accessibilityLabel="Mês anterior"
          accessibilityState={{ disabled: !canGoPrev }}
          testID="month-prev"
          hitSlop={8}
          style={[styles.arrowBtn, !canGoPrev ? styles.arrowDisabled : null]}
        >
          <ChevronLeft
            size={18}
            color={canGoPrev ? COLORS.text.primary : COLORS.text.secondary}
          />
        </Pressable>

        <View style={styles.center}>
          <Text style={styles.monthText} testID="month-label">
            {formatMonthLabel(month)}
          </Text>
        </View>

        <Pressable
          onPress={() => triggerStep(1)}
          disabled={!canGoNext}
          accessibilityRole="button"
          accessibilityLabel="Próximo mês"
          accessibilityState={{ disabled: !canGoNext }}
          testID="month-next"
          hitSlop={8}
          style={[styles.arrowBtn, !canGoNext ? styles.arrowDisabled : null]}
        >
          <ChevronRight
            size={18}
            color={canGoNext ? COLORS.text.primary : COLORS.text.secondary}
          />
        </Pressable>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  arrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  arrowDisabled: {
    opacity: 0.35,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  monthText: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.body,
    lineHeight: TYPOGRAPHY.lineHeight.body,
    letterSpacing: 0.2,
  },
});
