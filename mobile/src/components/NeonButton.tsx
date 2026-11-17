import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { type ReactNode, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { COLORS, SPACING, TYPOGRAPHY } from '../theme/tokens';

export type NeonButtonTone = 'cyan' | 'purple' | 'mint' | 'danger' | 'neutral';

export interface NeonButtonProps {
  label: string;
  onPress?: () => void;
  tone?: NeonButtonTone;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: 'md' | 'lg';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const TONE_MAP: Record<
  NeonButtonTone,
  {
    grad: readonly [string, string];
    borderTop: string;
    borderSide: string;
    accent: string;
    text: string;
  }
> = {
  cyan: {
    grad: ['rgba(30, 128, 224, 0.38)', 'rgba(10, 42, 92, 0.56)'],
    borderTop: 'rgba(186, 230, 253, 0.55)',
    borderSide: 'rgba(56, 189, 248, 0.38)',
    accent: COLORS.accent.ice,
    text: COLORS.text.primary,
  },
  purple: {
    grad: ['rgba(128, 64, 218, 0.36)', 'rgba(34, 16, 68, 0.54)'],
    borderTop: 'rgba(233, 213, 255, 0.50)',
    borderSide: 'rgba(168, 85, 247, 0.38)',
    accent: COLORS.orb.purpleSolid,
    text: COLORS.text.primary,
  },
  mint: {
    grad: ['rgba(16, 148, 112, 0.34)', 'rgba(8, 44, 38, 0.54)'],
    borderTop: 'rgba(167, 243, 208, 0.50)',
    borderSide: 'rgba(52, 211, 153, 0.38)',
    accent: COLORS.semantic.income,
    text: COLORS.text.primary,
  },
  danger: {
    grad: ['rgba(205, 58, 72, 0.34)', 'rgba(58, 14, 24, 0.56)'],
    borderTop: 'rgba(254, 202, 202, 0.50)',
    borderSide: 'rgba(248, 113, 113, 0.40)',
    accent: COLORS.semantic.expense,
    text: COLORS.text.primary,
  },
  neutral: {
    grad: ['rgba(34, 58, 108, 0.32)', 'rgba(10, 20, 44, 0.54)'],
    borderTop: 'rgba(224, 242, 255, 0.42)',
    borderSide: 'rgba(148, 186, 245, 0.24)',
    accent: COLORS.accent.ice,
    text: COLORS.text.primary,
  },
};

/**
 * Botão translúcido com chanfro cristalino em GPU (LinearGradient + borda óptica sem captura em CPU).
 */
function NeonButtonImpl({
  label,
  onPress,
  tone = 'cyan',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  size = 'lg',
  accessibilityLabel,
  style,
  testID,
}: NeonButtonProps) {
  const palette = TONE_MAP[tone];
  const isDisabled = disabled || loading;
  const height = size === 'lg' ? 52 : 44;

  const handlePress = useCallback(() => {
    if (isDisabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onPress?.();
  }, [isDisabled, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.outer,
        fullWidth ? styles.fullWidth : null,
        {
          minHeight: height,
          borderColor: palette.borderSide,
          borderTopColor: palette.borderTop,
          borderLeftColor: palette.borderTop,
        },
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      <LinearGradient
        colors={palette.grad}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.inner, { minHeight: height - 3 }]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={palette.accent} />
        ) : icon ? (
          <View style={styles.iconSlot}>{icon}</View>
        ) : null}
        <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

export const NeonButton = React.memo(NeonButtonImpl);

const styles = StyleSheet.create({
  outer: {
    borderRadius: 999,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: 'rgba(8, 16, 36, 0.42)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
  },
  fullWidth: {
    width: '100%',
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.48,
  },
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.body,
    letterSpacing: 0.15,
  },
});
