import * as Haptics from 'expo-haptics';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useCallback } from 'react';
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';

import { useMotion } from '../theme/MotionContext';
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
 * Seletor de mês em cápsula Liquid Glass com botões >= 48dp e deslize horizontal nativo (RNGH)
 * que bloqueia conflitos com o swipe externo de abas.
 */
function MonthSwitcherImpl({
  month,
  onChange,
  minMonth,
  maxMonth,
  style,
  testID,
}: MonthSwitcherProps) {
  const motion = useMotion();
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

  const monthPan = usePanGesture({
    runOnJS: true,
    activeOffsetX: [-12, 12],
    failOffsetY: [-10, 10],
    block: motion?.pagerGesture,
    onDeactivate: (event) => {
      if (event.canceled) return;
      if (event.translationX > 32) {
        triggerStep(-1);
      } else if (event.translationX < -32) {
        triggerStep(1);
      }
    },
  });

  return (
    <GestureDetector gesture={monthPan}>
      <View style={style} testID={testID}>
        <GlassCard variant="pill" interactive padding={SPACING.xs + 2} contentStyle={styles.row}>
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

          <Text style={styles.label} testID="month-label" numberOfLines={1}>
            {formatMonthLabel(month)}
          </Text>

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
    </GestureDetector>
  );
}

export const MonthSwitcher = React.memo(MonthSwitcherImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  arrowBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(200, 230, 255, 0.16)',
  },
  arrowDisabled: {
    opacity: 0.32,
  },
  label: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.section,
    letterSpacing: -0.2,
  },
});
