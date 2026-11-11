import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { COLORS, GLASS_METRICS, SPACING, TYPOGRAPHY } from '../theme/tokens';

export type StatusPillVariant = 'success' | 'warning' | 'error' | 'info' | 'muted';

export interface StatusPillProps {
  label: string;
  variant?: StatusPillVariant;
  showDot?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const VARIANT_COLORS: Record<
  StatusPillVariant,
  { bg: string; border: string; text: string; dot: string }
> = {
  success: {
    bg: 'rgba(52, 211, 153, 0.14)',
    border: 'rgba(52, 211, 153, 0.38)',
    text: COLORS.semantic.income,
    dot: COLORS.semantic.income,
  },
  warning: {
    bg: 'rgba(251, 191, 36, 0.14)',
    border: 'rgba(251, 191, 36, 0.38)',
    text: COLORS.semantic.warning,
    dot: COLORS.semantic.warning,
  },
  error: {
    bg: 'rgba(251, 113, 133, 0.14)',
    border: 'rgba(251, 113, 133, 0.38)',
    text: COLORS.semantic.error,
    dot: COLORS.semantic.error,
  },
  info: {
    bg: 'rgba(34, 211, 238, 0.14)',
    border: 'rgba(34, 211, 238, 0.38)',
    text: COLORS.semantic.info,
    dot: COLORS.semantic.info,
  },
  muted: {
    bg: 'rgba(139, 151, 173, 0.14)',
    border: 'rgba(139, 151, 173, 0.30)',
    text: COLORS.text.secondary,
    dot: COLORS.text.secondary,
  },
};

/**
 * Cápsula de status translúcida para badges como pendente, ignorado ou conexão.
 */
export function StatusPill({
  label,
  variant = 'info',
  showDot = true,
  icon,
  style,
  testID,
}: StatusPillProps) {
  const palette = VARIANT_COLORS[variant];

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={label}
      testID={testID}
    >
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      {showDot && !icon ? (
        <View style={[styles.dot, { backgroundColor: palette.dot }]} />
      ) : null}
      <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: GLASS_METRICS.radius.pill,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    gap: 6,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  label: {
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.micro,
    lineHeight: TYPOGRAPHY.lineHeight.micro,
    letterSpacing: 0.2,
  },
});
