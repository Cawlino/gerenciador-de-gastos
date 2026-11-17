import { Canvas, Fill, Shader, type SkRuntimeEffect } from '@shopify/react-native-skia';
import React, {
  type ComponentRef,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  type LayoutChangeEvent,
  Platform,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { getThickGlassEffect, parseRgbaToVec4 } from '../shaders/thickGlassShader';
import {
  computeWanderingAuras,
  packGlassUniformKey,
  useMotion,
  useScrollOffsetScope,
  useTabSlotIndex,
} from '../theme/MotionContext';
import { GLASS_METRICS, SPACING } from '../theme/tokens';

export type GlassCardVariant = 'card' | 'row' | 'pill' | 'elevated';
export type GlassTone = 'neutral' | 'cyan' | 'purple' | 'mint';
export type GlassSurfaceMode = 'glass' | 'lightweight';

export interface GlassCardProps {
  children?: ReactNode;
  variant?: GlassCardVariant;
  tone?: GlassTone;
  surface?: GlassSurfaceMode;
  interactive?: boolean;
  radius?: number;
  padding?: number;
  intensity?: number;
  refraction?: number;
  chromatic?: number;
  bevelWidth?: number;
  highlight?: number;
  tintColor?: string;
  forceFallback?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

const VARIANT_DEFAULTS: Record<
  GlassCardVariant,
  { radius: number; padding: number; bevel: number; highlight: number }
> = {
  card: { radius: GLASS_METRICS.radius.card, padding: SPACING.xl, bevel: 5.5, highlight: 0.96 },
  elevated: { radius: GLASS_METRICS.radius.card, padding: SPACING.xl, bevel: 6.5, highlight: 1.08 },
  row: { radius: GLASS_METRICS.radius.row, padding: SPACING.md + 2, bevel: 4.0, highlight: 0.88 },
  pill: { radius: GLASS_METRICS.radius.pill, padding: SPACING.md, bevel: 3.8, highlight: 0.92 },
};

const TONE_TINTS: Record<GlassTone, string> = {
  neutral: 'rgba(10, 16, 30, 0.48)',
  cyan: 'rgba(12, 34, 62, 0.50)',
  purple: 'rgba(28, 18, 52, 0.48)',
  mint: 'rgba(10, 38, 36, 0.48)',
};

const TONE_HAIRLINES: Record<GlassTone, string> = {
  neutral: 'rgba(255, 255, 255, 0.13)',
  cyan: 'rgba(125, 211, 252, 0.28)',
  purple: 'rgba(192, 132, 252, 0.28)',
  mint: 'rgba(110, 231, 183, 0.28)',
};

function sanitizeOuterStyle(style: StyleProp<ViewStyle>): {
  outerStyle: ViewStyle | undefined;
  extractedRadius: number | undefined;
} {
  const flat = StyleSheet.flatten(style);
  if (!flat) {
    return { outerStyle: undefined, extractedRadius: undefined };
  }

  const {
    backgroundColor: _bg,
    borderColor: _bc,
    borderTopColor: _btc,
    borderWidth: _bw,
    borderTopWidth: _btw,
    shadowColor: _sc,
    shadowRadius: _sr,
    shadowOffset: _so,
    shadowOpacity: _sop,
    elevation: _el,
    borderRadius: extractedRadius,
    ...rest
  } = flat;

  return {
    outerStyle: rest as ViewStyle,
    extractedRadius: typeof extractedRadius === 'number' ? extractedRadius : undefined,
  };
}

interface LightweightGlassCardProps {
  children?: ReactNode;
  outerStyle: ViewStyle | undefined;
  resolvedRadius: number;
  resolvedPadding: number;
  hairlineColor: string;
  fallbackFill: string;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

function LightweightGlassCard({
  children,
  outerStyle,
  resolvedRadius,
  resolvedPadding,
  hairlineColor,
  fallbackFill,
  contentStyle,
  testID,
}: LightweightGlassCardProps) {
  return (
    <View style={[styles.container, { borderRadius: resolvedRadius }, outerStyle]} testID={testID}>
      <View
        testID={testID ? `${testID}-fallback` : 'glass-card-fallback'}
        style={[
          styles.fallbackSurface,
          {
            borderRadius: resolvedRadius,
            backgroundColor: fallbackFill,
            borderColor: hairlineColor,
            padding: resolvedPadding,
          },
          contentStyle,
        ]}
      >
        <View
          pointerEvents="none"
          style={[
            styles.fallbackTopHairline,
            {
              borderTopLeftRadius: resolvedRadius,
              borderTopRightRadius: resolvedRadius,
            },
          ]}
        />
        {children}
      </View>
    </View>
  );
}

interface ThickGlassCardProps {
  children?: ReactNode;
  outerStyle: ViewStyle | undefined;
  resolvedRadius: number;
  resolvedPadding: number;
  resolvedBevel: number;
  resolvedHighlight: number;
  resolvedTint: string;
  refraction: number;
  chromatic: number;
  thickEffect: SkRuntimeEffect;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

function ThickGlassCard({
  children,
  outerStyle,
  resolvedRadius,
  resolvedPadding,
  resolvedBevel,
  resolvedHighlight,
  resolvedTint,
  refraction,
  chromatic,
  thickEffect,
  contentStyle,
  testID,
}: ThickGlassCardProps) {
  const { width: rawWinW, height: rawWinH } = useWindowDimensions();
  const vpW = rawWinW > 0 ? rawWinW : 390;
  const vpH = rawWinH > 0 ? rawWinH : 840;

  const motion = useMotion();
  const scrollScope = useScrollOffsetScope();
  const motionAuraCoords = motion?.auraCoords;
  const tabSlot = useTabSlotIndex();
  const fallbackScrollY = useSharedValue(0);
  const fallbackTabProgress = useSharedValue(0);
  const fallbackPullOffset = useSharedValue(0);
  const fallbackDeflectX = useSharedValue(0);
  const fallbackDeflectY = useSharedValue(0);
  const fallbackHorizX = useSharedValue(0);
  const scrollYSV =
    scrollScope?.scrollY ??
    (motion?.hasSharedBackground ? fallbackScrollY : (motion?.scrollY ?? fallbackScrollY));
  const tabProgressSV = motion?.tabProgress ?? fallbackTabProgress;
  const pullOffsetSV =
    scrollScope?.pullOffset ??
    (motion?.hasSharedBackground ? fallbackPullOffset : (motion?.pullOffset ?? fallbackPullOffset));
  const deflectXSV = motion?.auraDeflectX ?? fallbackDeflectX;
  const deflectYSV = motion?.auraDeflectY ?? fallbackDeflectY;
  const horizXSV = motion?.auraHorizX ?? fallbackHorizX;

  const containerRef = useRef<ComponentRef<typeof View>>(null);
  const hasLayoutSV = useSharedValue(0);
  const anchorXSV = useSharedValue(16);
  const anchorYSV = useSharedValue(240);
  const sizeWSV = useSharedValue(1);
  const sizeHSV = useSharedValue(1);
  const sizeArrSV = useSharedValue<readonly [number, number]>([1, 1]);
  const cfgVersionSV = useSharedValue(0);

  const tintVec = useMemo(() => parseRgbaToVec4(resolvedTint), [resolvedTint]);
  const refractionRatio = refraction / GLASS_METRICS.refractionStrength;
  const resolvedChromatic = Math.min(1.0, Math.max(0.04, chromatic * 0.22 * refractionRatio));
  const resolvedHighlightScaled = resolvedHighlight * (0.94 + 0.06 * refractionRatio);

  const styleCfgSV = useSharedValue({
    radius: resolvedRadius,
    bevel: resolvedBevel,
    vpW,
    vpH,
    viewportArr: [vpW, vpH] as readonly [number, number],
    tint: tintVec,
    highlight: resolvedHighlightScaled,
    chromatic: resolvedChromatic,
  });

  useEffect(() => {
    styleCfgSV.set({
      radius: resolvedRadius,
      bevel: resolvedBevel,
      vpW,
      vpH,
      viewportArr: [vpW, vpH],
      tint: tintVec,
      highlight: resolvedHighlightScaled,
      chromatic: resolvedChromatic,
    });
    cfgVersionSV.set((v) => v + 1);
  }, [
    cfgVersionSV,
    resolvedBevel,
    resolvedChromatic,
    resolvedHighlightScaled,
    resolvedRadius,
    styleCfgSV,
    tintVec,
    vpH,
    vpW,
  ]);

  const uniformsSV = useSharedValue({
    uSize: [1, 1] as readonly [number, number],
    uRadius: resolvedRadius,
    uBevel: resolvedBevel,
    uScreenOrigin: [16, 240] as readonly [number, number],
    uViewport: [vpW, vpH] as readonly [number, number],
    uAura1: [vpW * 0.38, vpH * 0.16] as readonly [number, number],
    uAura2: [vpW * 0.84, vpH * 0.63] as readonly [number, number],
    uTint: tintVec,
    uHighlight: resolvedHighlightScaled,
    uChromatic: resolvedChromatic,
  });

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextW = Math.round(event.nativeEvent.layout.width);
      const nextH = Math.round(event.nativeEvent.layout.height);
      if (nextW > 0 && nextH > 0) {
        if (nextW !== sizeWSV.get() || nextH !== sizeHSV.get()) {
          sizeWSV.set(nextW);
          sizeHSV.set(nextH);
          sizeArrSV.set([nextW, nextH]);
          uniformsSV.set({
            ...uniformsSV.get(),
            uSize: [nextW, nextH] as const,
          });
          cfgVersionSV.set((v) => v + 1);
        }
        if (hasLayoutSV.get() !== 1) {
          hasLayoutSV.set(1);
        }
      } else if (hasLayoutSV.get() !== 0) {
        hasLayoutSV.set(0);
      }

      if (typeof containerRef.current?.measureInWindow === 'function') {
        requestAnimationFrame(() => {
          containerRef.current?.measureInWindow?.((winX: number, winY: number) => {
            if (!Number.isFinite(winY) || !Number.isFinite(winX)) return;
            const rawLocalX = tabSlot >= 0 ? winX - (tabSlot - tabProgressSV.get()) * vpW : winX;
            const localX = ((rawLocalX % vpW) + vpW) % vpW;
            const currentScroll = scrollYSV.get();
            const currentPull = pullOffsetSV.get();
            const nextAnchorY = winY + currentScroll - currentPull;
            if (
              Math.abs(localX - anchorXSV.get()) > 0.5 ||
              Math.abs(nextAnchorY - anchorYSV.get()) > 0.5
            ) {
              anchorXSV.set(localX);
              anchorYSV.set(nextAnchorY);
              cfgVersionSV.set((v) => v + 1);
            }
          });
        });
      }
    },
    [
      anchorXSV,
      anchorYSV,
      cfgVersionSV,
      hasLayoutSV,
      pullOffsetSV,
      scrollYSV,
      sizeArrSV,
      sizeHSV,
      sizeWSV,
      tabProgressSV,
      tabSlot,
      uniformsSV,
      vpW,
    ],
  );

  // Culling inteligente 120Hz sem alocação de string/tuple extra em worklets:
  // empacota posição/auras com precisão 0.5dp em hash inteiro de 52 bits sem ler uniformsSV no prepare.
  useAnimatedReaction(
    (): number => {
      const w = sizeWSV.get();
      const h = sizeHSV.get();
      if (w <= 1 || h <= 1) return -1;

      const tab = tabProgressSV.get();
      const cfgVer = cfgVersionSV.get();
      const cfg = styleCfgSV.get();
      const ax = anchorXSV.get();
      const screenLeft = tabSlot >= 0 ? ax + (tabSlot - tab) * cfg.vpW : ax;

      if (tabSlot >= 0) {
        if (Math.abs(tab - tabSlot) >= 0.992 || screenLeft + w <= 0 || screenLeft >= cfg.vpW) {
          return -2;
        }
      }

      const sy = scrollYSV.get();
      const pull = pullOffsetSV.get();
      const screenTop = anchorYSV.get() - sy + pull;

      if (screenTop + h <= 0 || screenTop >= cfg.vpH) {
        return -2;
      }

      const auras = motionAuraCoords
        ? motionAuraCoords.get()
        : computeWanderingAuras(
            sy,
            tab,
            pull,
            deflectXSV.get(),
            deflectYSV.get(),
            cfg.vpW,
            cfg.vpH,
            horizXSV.get(),
          );

      return packGlassUniformKey(
        Math.round(screenTop * 2),
        Math.round(screenLeft * 2),
        Math.round(auras.c1x * 2),
        Math.round(auras.c1y * 2),
        Math.round(auras.c2x * 2),
        Math.round(auras.c2y * 2),
        cfgVer,
      );
    },
    (nextKey, prevKey) => {
      if (nextKey < 0 || nextKey === prevKey) return;
      const cfg = styleCfgSV.get();
      const sy = scrollYSV.get();
      const pull = pullOffsetSV.get();
      const tab = tabProgressSV.get();
      const ax = anchorXSV.get();
      const screenLeft = tabSlot >= 0 ? ax + (tabSlot - tab) * cfg.vpW : ax;
      const screenTop = anchorYSV.get() - sy + pull;

      const auras = motionAuraCoords
        ? motionAuraCoords.get()
        : computeWanderingAuras(
            sy,
            tab,
            pull,
            deflectXSV.get(),
            deflectYSV.get(),
            cfg.vpW,
            cfg.vpH,
            horizXSV.get(),
          );

      uniformsSV.set({
        uSize: sizeArrSV.get(),
        uRadius: cfg.radius,
        uBevel: cfg.bevel,
        uScreenOrigin: [screenLeft, screenTop] as const,
        uViewport: cfg.viewportArr,
        uAura1: [auras.c1x, auras.c1y] as const,
        uAura2: [auras.c2x, auras.c2y] as const,
        uTint: cfg.tint,
        uHighlight: cfg.highlight,
        uChromatic: cfg.chromatic,
      });
    },
  );

  const canvasRevealStyle = useAnimatedStyle(() => ({
    opacity: hasLayoutSV.get(),
  }));

  return (
    <View
      ref={containerRef}
      testID={testID}
      onLayout={handleLayout}
      style={[
        styles.container,
        { borderRadius: resolvedRadius },
        outerStyle,
      ]}
    >
      <View
        style={[
          styles.liquidSurface,
          {
            borderRadius: resolvedRadius,
            padding: resolvedPadding,
          },
          contentStyle,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, canvasRevealStyle]}
        >
          <Canvas
            pointerEvents="none"
            testID={testID ? `${testID}-liquid` : 'glass-card-liquid'}
            style={StyleSheet.absoluteFill}
          >
            <Fill>
              <Shader source={thickEffect} uniforms={uniformsSV} />
            </Fill>
          </Canvas>
        </Animated.View>
        {children}
      </View>
    </View>
  );
}

/**
 * Superfície Liquid Glass minimalista estilo iOS 26 em GPU Skia.
 * Cada card mede sua posição na viewport e atualiza uniforms via worklet 120Hz
 * para que as bordas refratem o degradê azul desfocado ao cruzar áreas iluminadas.
 */
function GlassCardImpl({
  children,
  variant = 'card',
  tone = 'neutral',
  surface = 'glass',
  interactive = false,
  radius,
  padding,
  refraction = GLASS_METRICS.refractionStrength,
  chromatic = GLASS_METRICS.chromaticSpread,
  bevelWidth,
  highlight,
  tintColor,
  forceFallback = false,
  style,
  contentStyle,
  testID,
}: GlassCardProps) {
  const defaults = VARIANT_DEFAULTS[variant];
  const { outerStyle, extractedRadius } = sanitizeOuterStyle(style);
  const resolvedRadius = radius ?? extractedRadius ?? defaults.radius;
  const resolvedPadding = padding ?? defaults.padding;
  const resolvedBevel = bevelWidth ?? defaults.bevel;
  const resolvedHighlight =
    highlight ?? (interactive ? Math.max(defaults.highlight, 1.04) : defaults.highlight);

  const resolvedTint =
    tintColor ??
    (variant === 'elevated' && tone === 'neutral' ? 'rgba(12, 22, 44, 0.52)' : TONE_TINTS[tone]);

  const thickEffect = useMemo(() => getThickGlassEffect(), []);
  const useThickGlass =
    surface === 'glass' && !forceFallback && Platform.OS !== 'web' && thickEffect !== null;

  if (!useThickGlass || !thickEffect) {
    const hairlineColor =
      tintColor && tone === 'neutral'
        ? tintColor.replace(/[\d.]+\)$/, '0.26)')
        : TONE_HAIRLINES[tone];
    const fallbackFill =
      tintColor ?? (surface === 'lightweight' ? 'rgba(12, 18, 30, 0.56)' : resolvedTint);

    return (
      <LightweightGlassCard
        outerStyle={outerStyle}
        resolvedRadius={resolvedRadius}
        resolvedPadding={resolvedPadding}
        hairlineColor={hairlineColor}
        fallbackFill={fallbackFill}
        contentStyle={contentStyle}
        testID={testID}
      >
        {children}
      </LightweightGlassCard>
    );
  }

  return (
    <ThickGlassCard
      outerStyle={outerStyle}
      resolvedRadius={resolvedRadius}
      resolvedPadding={resolvedPadding}
      resolvedBevel={resolvedBevel}
      resolvedHighlight={resolvedHighlight}
      resolvedTint={resolvedTint}
      refraction={refraction}
      chromatic={chromatic}
      thickEffect={thickEffect}
      contentStyle={contentStyle}
      testID={testID}
    >
      {children}
    </ThickGlassCard>
  );
}

export const GlassCard = React.memo(GlassCardImpl);

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  liquidSurface: {
    position: 'relative',
    overflow: 'hidden',
  },
  fallbackSurface: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  fallbackTopHairline: {
    position: 'absolute',
    top: 0,
    left: 10,
    right: 10,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
});
