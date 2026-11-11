import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { COLORS, TYPOGRAPHY } from '../theme/tokens';
import { formatBRL, formatSignedBRL } from '../utils/format';

export type AmountTone = 'auto' | 'income' | 'expense' | 'neutral';

export interface AmountTextProps {
  value: number;
  signed?: boolean;
  absolute?: boolean;
  tone?: AmountTone;
  size?: number;
  weight?: keyof typeof TYPOGRAPHY.family;
  glow?: boolean;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

/**
 * Exibe valores monetários em BRL com algarismos tabulares e cor semântica.
 */
export function AmountText({
  value,
  signed = false,
  absolute = false,
  tone = 'auto',
  size = TYPOGRAPHY.size.body,
  weight = 'semibold',
  glow = false,
  muted = false,
  style,
  testID,
}: AmountTextProps) {
  const safe = Number.isFinite(value) && Math.abs(value) >= 0.005 ? value : 0;

  let resolvedTone: Exclude<AmountTone, 'auto'>;
  if (tone === 'auto') {
    resolvedTone = safe > 0 ? 'income' : safe < 0 ? 'expense' : 'neutral';
  } else {
    resolvedTone = tone;
  }

  const color = muted
    ? COLORS.text.secondary
    : resolvedTone === 'income'
      ? COLORS.semantic.income
      : resolvedTone === 'expense'
        ? COLORS.semantic.expense
        : COLORS.text.primary;

  const formatted = signed ? formatSignedBRL(safe) : formatBRL(safe, { absolute });

  return (
    <Text
      style={[
        styles.base,
        {
          color,
          fontSize: size,
          fontFamily: TYPOGRAPHY.family[weight],
          textDecorationLine: muted ? 'line-through' : 'none',
        },
        glow && !muted ? { textShadowColor: color, textShadowRadius: 10 } : null,
        style,
      ]}
      testID={testID}
    >
      {formatted}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
});
