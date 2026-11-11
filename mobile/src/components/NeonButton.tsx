import React, { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { COLORS, GLASS_METRICS, SPACING, TYPOGRAPHY } from '../theme/tokens';

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
  { bg: string; border: string; glow: string; text: string }
> = {
  cyan: {
    bg: 'rgba(34, 211, 238, 0.14)',
    border: 'rgba(34, 211, 238, 0.58)',
    glow: COLORS.neon.cyan,
    text: COLORS.text.primary,
  },
  purple: {
    bg: 'rgba(168, 85, 247, 0.16)',
    border: 'rgba(168, 85, 247, 0.58)',
    glow: COLORS.neon.purple,
    text: COLORS.text.primary,
  },
  mint: {
    bg: 'rgba(52, 211, 153, 0.14)',
    border: 'rgba(52, 211, 153, 0.55)',
    glow: COLORS.neon.mint,
    text: COLORS.text.primary,
  },
  danger: {
    bg: 'rgba(251, 113, 133, 0.14)',
    border: 'rgba(251, 113, 133, 0.55)',
    glow: COLORS.semantic.expense,
    text: COLORS.text.primary,
  },
  neutral: {
    bg: 'rgba(255, 255, 255, 0.08)',
    border: 'rgba(255, 255, 255, 0.24)',
    glow: '#FFFFFF',
    text: COLORS.text.primary,
  },
};

/**
 * Botão cápsula translúcido com borda neon e feedback tátil ao toque.
 */
export function NeonButton({
  label,
  onPress,
  tone = 'cyan',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  size = 'md',
  accessibilityLabel,
  style,
  testID,
}: NeonButtonProps) {
  const scale = useSharedValue(1);
  const palette = TONE_MAP[tone];
  const isInactive = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (isInactive) return;
    scale.set(withSpring(0.97, { damping: 18, stiffness: 320 }));
  };

  const handlePressOut = () => {
    scale.set(withSpring(1, { damping: 18, stiffness: 320 }));
  };

  const handlePress = () => {
    if (isInactive) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onPress?.();
  };

  return (
    <Animated.View style={[animatedStyle, fullWidth ? styles.fullWidth : null, style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isInactive}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: isInactive, busy: loading }}
        testID={testID}
        style={[
          styles.button,
          size === 'lg' ? styles.buttonLg : styles.buttonMd,
          {
            backgroundColor: palette.bg,
            borderColor: palette.border,
            shadowColor: palette.glow,
            opacity: isInactive ? 0.55 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={palette.glow} />
        ) : icon ? (
          <View style={styles.iconWrap}>{icon}</View>
        ) : null}
        <Text
          style={[
            styles.label,
            size === 'lg' ? styles.labelLg : null,
            { color: palette.text },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullWidth: {
    width: '100%',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: GLASS_METRICS.radius.pill,
    borderWidth: 1,
    gap: SPACING.sm,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  buttonMd: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 3,
    minHeight: 42,
  },
  buttonLg: {
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md + 2,
    minHeight: 50,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.body,
    lineHeight: TYPOGRAPHY.lineHeight.body,
  },
  labelLg: {
    fontSize: TYPOGRAPHY.size.section,
    lineHeight: TYPOGRAPHY.lineHeight.section,
  },
});
