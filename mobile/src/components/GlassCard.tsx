import React, { useMemo, useState, type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BackdropFilter,
  Blur as SkiaBlur,
  Canvas,
  Group,
  LinearGradient as SkiaLinearGradient,
  Rect,
  RoundedRect,
  RuntimeShader,
  rect,
  rrect,
  vec,
} from '@shopify/react-native-skia';
import {
  colorToShaderVec4,
  getLiquidGlassEffect,
} from '../shaders/liquidGlassShader';
import { COLORS, GLASS_METRICS, SPACING } from '../theme/tokens';

export type GlassCardVariant = 'card' | 'row' | 'pill' | 'elevated';
export type GlassTone = 'neutral' | 'cyan' | 'purple' | 'mint';

export interface GlassCardProps {
  children?: ReactNode;
  variant?: GlassCardVariant;
  tone?: GlassTone;
  radius?: number;
  padding?: number;
  intensity?: number;
  refraction?: number;
  chromatic?: number;
  tintColor?: string;
  forceFallback?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

const VARIANT_DEFAULTS: Record<GlassCardVariant, { radius: number; padding: number }> = {
  card: { radius: GLASS_METRICS.radius.card, padding: SPACING.xl },
  elevated: { radius: GLASS_METRICS.radius.card, padding: SPACING.xl },
  row: { radius: GLASS_METRICS.radius.row, padding: SPACING.md + 2 },
  pill: { radius: GLASS_METRICS.radius.pill, padding: SPACING.md },
};

const TONE_TINTS: Record<GlassTone, string> = {
  neutral: COLORS.glass.fill,
  cyan: COLORS.glass.tintCyan,
  purple: COLORS.glass.tintPurple,
  mint: COLORS.glass.tintMint,
};

const TONE_BORDER_START: Record<GlassTone, string> = {
  neutral: COLORS.glass.strokeStart,
  cyan: 'rgba(34, 211, 238, 0.34)',
  purple: 'rgba(168, 85, 247, 0.34)',
  mint: 'rgba(52, 211, 153, 0.34)',
};

/**
 * Cartão translúcido Liquid Glass com shader SkSL de refração + dispersão cromática
 * e degradação graciosa via BlurView / superfície translúcida.
 */
export function GlassCard({
  children,
  variant = 'card',
  tone = 'neutral',
  radius,
  padding,
  intensity = 38,
  refraction = GLASS_METRICS.refractionStrength,
  chromatic = GLASS_METRICS.chromaticSpread,
  tintColor,
  forceFallback = false,
  style,
  contentStyle,
  testID,
}: GlassCardProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const defaults = VARIANT_DEFAULTS[variant];
  const resolvedRadius = radius ?? defaults.radius;
  const resolvedPadding = padding ?? defaults.padding;
  const resolvedTint =
    tintColor ?? (variant === 'elevated' ? COLORS.glass.fillElevated : TONE_TINTS[tone]);

  const effect = useMemo(() => (forceFallback ? null : getLiquidGlassEffect()), [forceFallback]);

  const effectiveRadius =
    size.width > 0 && size.height > 0
      ? Math.min(resolvedRadius, size.width / 2, size.height / 2)
      : resolvedRadius;

  const canRenderSkiaShader =
    !forceFallback &&
    Platform.OS !== 'web' &&
    effect !== null &&
    size.width > 0 &&
    size.height > 0;

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (Math.abs(width - size.width) > 0.5 || Math.abs(height - size.height) > 0.5) {
      setSize({ width, height });
    }
  };

  const clipRRect = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return null;
    return rrect(rect(0, 0, size.width, size.height), effectiveRadius, effectiveRadius);
  }, [effectiveRadius, size.height, size.width]);

  const uniforms = useMemo(
    () => ({
      uSize: [Math.max(size.width, 1), Math.max(size.height, 1)],
      uRadius: effectiveRadius,
      uRefraction: refraction,
      uChromatic: chromatic,
      uTint: colorToShaderVec4(resolvedTint),
    }),
    [chromatic, effectiveRadius, refraction, resolvedTint, size.height, size.width],
  );

  const blurSigma = Math.max(6, Math.round((intensity / 38) * GLASS_METRICS.blurSigma));
  const strokeStart = TONE_BORDER_START[tone];

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.container,
        {
          borderRadius: resolvedRadius,
        },
        style,
      ]}
      testID={testID}
    >
      <View
        style={[StyleSheet.absoluteFill, { borderRadius: resolvedRadius, overflow: 'hidden' }]}
        pointerEvents="none"
      >
        {canRenderSkiaShader && effect && clipRRect ? (
          <View
            style={StyleSheet.absoluteFill}
            testID={testID ? `${testID}-shader` : 'glass-card-shader'}
          >
            <BlurView
              intensity={intensity}
              tint="dark"
              blurMethod="dimezisBlurViewSdk31Plus"
              style={StyleSheet.absoluteFill}
            />
            <Canvas style={StyleSheet.absoluteFill}>
              <Group clip={clipRRect}>
                <Rect x={0} y={0} width={size.width} height={size.height}>
                  <SkiaLinearGradient
                    start={vec(0, 0)}
                    end={vec(size.width, size.height)}
                    colors={['rgba(15, 23, 42, 0.56)', 'rgba(17, 24, 39, 0.42)']}
                  />
                </Rect>
                <BackdropFilter
                  filter={
                    <RuntimeShader source={effect} uniforms={uniforms}>
                      <SkiaBlur blur={blurSigma} mode="clamp" />
                    </RuntimeShader>
                  }
                />
                <RoundedRect
                  x={0.5}
                  y={0.5}
                  width={Math.max(size.width - 1, 0)}
                  height={Math.max(size.height - 1, 0)}
                  r={effectiveRadius}
                  style="stroke"
                  strokeWidth={GLASS_METRICS.strokeWidth}
                >
                  <SkiaLinearGradient
                    start={vec(0, 0)}
                    end={vec(size.width, size.height)}
                    colors={[strokeStart, COLORS.glass.strokeEnd]}
                  />
                </RoundedRect>
              </Group>
            </Canvas>
          </View>
        ) : (
          <View
            style={StyleSheet.absoluteFill}
            testID={testID ? `${testID}-fallback` : 'glass-card-fallback'}
          >
            {Platform.OS !== 'web' ? (
              <BlurView
                intensity={intensity}
                tint="dark"
                blurMethod="dimezisBlurViewSdk31Plus"
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    Platform.OS === 'web' || forceFallback
                      ? COLORS.glass.fallbackFill
                      : resolvedTint,
                },
              ]}
            />
            <LinearGradient
              colors={[strokeStart, COLORS.glass.strokeEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                StyleSheet.absoluteFill,
                styles.fallbackStrokeMask,
                { borderRadius: resolvedRadius },
              ]}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: resolvedRadius,
                  borderWidth: GLASS_METRICS.strokeWidth,
                  borderColor: strokeStart,
                },
              ]}
            />
          </View>
        )}
      </View>

      <View style={[{ padding: resolvedPadding }, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: 'transparent',
  },
  fallbackStrokeMask: {
    opacity: 0.14,
  },
});
