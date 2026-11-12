import React, { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { GLASS_METRICS, SPACING } from '../theme/tokens';
import { GlassCard } from './GlassCard';

export interface SkeletonBlockProps {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Bloco placeholder fosco com pulsação suave para estados de carregamento.
 */
export function SkeletonBlock({
  width = '100%',
  height,
  radius = 12,
  style,
  testID,
}: SkeletonBlockProps) {
  const opacity = useSharedValue(0.32);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(opacity);
      opacity.value = 0.48;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.68, { duration: 850, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.32, { duration: 850, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [opacity, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.block,
        {
          width,
          height,
          borderRadius: radius,
        },
        animatedStyle,
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    />
  );
}

/**
 * Placeholder estrutural de cartão Liquid Glass do painel principal.
 */
export function SkeletonCard({ testID }: { testID?: string }) {
  return (
    <GlassCard variant="card" testID={testID}>
      <View style={styles.cardStack}>
        <SkeletonBlock width="42%" height={14} radius={8} />
        <SkeletonBlock width="68%" height={34} radius={10} />
        <View style={styles.splitRow}>
          <SkeletonBlock width="46%" height={18} radius={8} />
          <SkeletonBlock width="46%" height={18} radius={8} />
        </View>
      </View>
    </GlassCard>
  );
}

/**
 * Placeholder estrutural compacto equivalente a uma linha de transação.
 */
export function SkeletonRow({ testID }: { testID?: string }) {
  return (
    <GlassCard variant="row" padding={SPACING.md + 2} testID={testID}>
      <View style={styles.row}>
        <SkeletonBlock width={40} height={40} radius={GLASS_METRICS.radius.row - 4} />
        <View style={styles.rowTextCol}>
          <SkeletonBlock width="72%" height={15} radius={8} />
          <SkeletonBlock width="48%" height={12} radius={6} />
        </View>
        <SkeletonBlock width={76} height={16} radius={8} />
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardStack: {
    gap: SPACING.md,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  rowTextCol: {
    flex: 1,
    gap: SPACING.sm,
  },
});
