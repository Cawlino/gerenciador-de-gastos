import { Canvas, Fill, Shader, Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import { Platform, StyleProp, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { computeWanderingAuras, useMotion, type WanderingAuraCoords } from '../theme/MotionContext';
import { COLORS } from '../theme/tokens';

export interface GlassBackgroundProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'ocean' | 'night' | 'calm';
  /** Força renderização completa mesmo dentro de um container com fundo compartilhado. */
  ignoreSharedBackground?: boolean;
  testID?: string;
}

const OCEAN_BASE_COLORS = [
  '#114394',
  '#0B2E6B',
  '#061B44',
  '#020B20',
  '#010512',
] as const;

const CALM_BASE_COLORS = [
  '#0D3575',
  '#082454',
  '#041333',
  '#020818',
  '#01040D',
] as const;

const PRIMARY_AURA_TEX_SIZE = 270;
const PRIMARY_AURA_HALF = PRIMARY_AURA_TEX_SIZE * 0.5;
const SECONDARY_AURA_TEX_SIZE = 240;
const SECONDARY_AURA_HALF = SECONDARY_AURA_TEX_SIZE * 0.5;
const AURA_TEX_UPSAMPLE = 2;

const AURA_RETURN_SPRING = {
  damping: 18,
  stiffness: 140,
  mass: 0.9,
} as const;

const PRIMARY_AURA_SKSL = `
uniform float2 uSize;

half4 main(float2 fragCoord) {
  float2 uv = (fragCoord / max(uSize, float2(1.0))) * 2.0 - 1.0;
  float d = length(float2(uv.x * 0.92, uv.y * 1.04));
  float core = exp(-d * d * 3.8);
  float halo = exp(-d * d * 1.7);
  float fade = smoothstep(1.0, 0.58, d);

  float3 sky = float3(0.220, 0.698, 1.000);
  float3 ocean = float3(0.067, 0.263, 0.580);
  float3 cobalt = float3(0.043, 0.180, 0.420);

  float3 rgb = mix(cobalt, ocean, clamp(halo, 0.0, 1.0));
  rgb = mix(rgb, sky, clamp(core * 0.58, 0.0, 1.0));
  float alpha = clamp((core * 0.44 + halo * 0.30) * fade, 0.0, 0.72);
  return half4(half3(rgb * alpha), half(alpha));
}
`;

const SECONDARY_AURA_SKSL = `
uniform float2 uSize;

half4 main(float2 fragCoord) {
  float2 uv = (fragCoord / max(uSize, float2(1.0))) * 2.0 - 1.0;
  float d = length(float2(uv.x * 0.92, uv.y * 1.04));
  float core = exp(-d * d * 3.6);
  float halo = exp(-d * d * 1.65);
  float fade = smoothstep(1.0, 0.58, d);

  float3 azure = float3(0.118, 0.424, 0.878);
  float3 cobalt = float3(0.043, 0.180, 0.420);

  float3 rgb = mix(cobalt, azure, clamp(core * 0.65, 0.0, 1.0));
  float alpha = clamp((core * 0.36 + halo * 0.26) * fade, 0.0, 0.56);
  return half4(half3(rgb * alpha), half(alpha));
}
`;

let cachedPrimaryAuraEffect: SkRuntimeEffect | null = null;
let cachedSecondaryAuraEffect: SkRuntimeEffect | null = null;
let auraCompilationTried = false;

function getAuraEffects(): {
  primary: SkRuntimeEffect | null;
  secondary: SkRuntimeEffect | null;
} {
  if (!auraCompilationTried) {
    auraCompilationTried = true;
    try {
      cachedPrimaryAuraEffect = Skia.RuntimeEffect.Make(PRIMARY_AURA_SKSL) ?? null;
      cachedSecondaryAuraEffect = Skia.RuntimeEffect.Make(SECONDARY_AURA_SKSL) ?? null;
    } catch {
      cachedPrimaryAuraEffect = null;
      cachedSecondaryAuraEffect = null;
    }
  }
  return {
    primary: cachedPrimaryAuraEffect,
    secondary: cachedSecondaryAuraEffect,
  };
}

/**
 * Fundo Liquid Glass oceânico cobrindo 100% da tela, com duas auras azuis difusas
 * que vagam continuamente por toda a viewport ao rolar/navegar entre abas e desviam
 * elasticamente (withSpring) diante da passagem dos cards.
 */
export function GlassBackground({
  children,
  style,
  variant = 'ocean',
  ignoreSharedBackground = false,
  testID,
}: GlassBackgroundProps) {
  const { width: rawVpW, height: rawVpH } = useWindowDimensions();
  const vpW = rawVpW > 0 ? rawVpW : 390;
  const vpH = rawVpH > 0 ? rawVpH : 840;

  const motion = useMotion();
  const reducedMotion = useReducedMotion();
  const fallbackScrollY = useSharedValue(0);
  const fallbackTabProgress = useSharedValue(0);
  const fallbackPullOffset = useSharedValue(0);
  const fallbackDeflectX = useSharedValue(0);
  const fallbackDeflectY = useSharedValue(0);
  const fallbackHorizX = useSharedValue(0);

  const scrollY = motion ? motion.scrollY : fallbackScrollY;
  const tabProgress = motion ? motion.tabProgress : fallbackTabProgress;
  const pullOffset = motion ? motion.pullOffset : fallbackPullOffset;
  const deflectX = motion ? motion.auraDeflectX : fallbackDeflectX;
  const deflectY = motion ? motion.auraDeflectY : fallbackDeflectY;
  const horizX = motion ? motion.auraHorizX : fallbackHorizX;
  const hasSharedAuras = Boolean(motion?.auraCoords);

  useAnimatedReaction(
    () => (hasSharedAuras ? 0 : scrollY.get()),
    (nextY, prevY) => {
      'worklet';
      if (hasSharedAuras || reducedMotion || prevY === null) {
        return;
      }
      const dy = nextY - prevY;
      if (Math.abs(dy) < 0.08 || Math.abs(dy) > 260) {
        return;
      }

      const clampedDy = Math.max(-34, Math.min(34, dy));
      const absDy = Math.abs(clampedDy);
      const speedNorm = absDy / (absDy + 9);
      const cardWave = Math.sin(nextY / 115);

      const targetX = cardWave * 52 * speedNorm;
      const dirY = clampedDy > 0 ? -1 : 1;
      const targetY = dirY * 44 * speedNorm;

      const curX = deflectX.get();
      const curY = deflectY.get();
      const nextX = curX + (targetX - curX) * 0.28;
      const nextYVal = curY + (targetY - curY) * 0.28;

      deflectX.set(nextX);
      deflectX.set(withSpring(0, { ...AURA_RETURN_SPRING, velocity: (nextX - curX) * 36 }));
      deflectY.set(nextYVal);
      deflectY.set(withSpring(0, { ...AURA_RETURN_SPRING, velocity: (nextYVal - curY) * 36 }));
    },
  );

  useAnimatedReaction(
    () => (hasSharedAuras ? 0 : tabProgress.get()),
    (nextTab, prevTab) => {
      'worklet';
      if (hasSharedAuras || reducedMotion || prevTab === null) {
        return;
      }
      const dt = nextTab - prevTab;
      if (Math.abs(dt) < 0.00008 || Math.abs(dt) > 0.6) {
        return;
      }

      const clampedDt = Math.max(-0.14, Math.min(0.14, dt));
      const absDt = Math.abs(clampedDt);
      const speedNorm = absDt / (absDt + 0.022);
      const dir = clampedDt > 0 ? -1 : 1;

      const targetHorizX = dir * 56 * speedNorm;
      const waveY = Math.sin(nextTab * Math.PI);
      const targetY = 26 * waveY * speedNorm;

      const curHX = horizX.get();
      const curY = deflectY.get();
      const nextHX = curHX + (targetHorizX - curHX) * 0.3;
      const nextYVal = curY + (targetY - curY) * 0.24;

      horizX.set(nextHX);
      horizX.set(withSpring(0, { ...AURA_RETURN_SPRING, velocity: (nextHX - curHX) * 38 }));
      deflectY.set(nextYVal);
      deflectY.set(withSpring(0, { ...AURA_RETURN_SPRING, velocity: (nextYVal - curY) * 34 }));
    },
  );

  const fallbackAuras = useDerivedValue<WanderingAuraCoords>(() => {
    if (hasSharedAuras) {
      return { c1x: 0, c1y: 0, c2x: 0, c2y: 0 };
    }
    if (reducedMotion) {
      return computeWanderingAuras(0, 0, 0, 0, 0, vpW, vpH, 0);
    }
    return computeWanderingAuras(
      scrollY.get(),
      tabProgress.get(),
      pullOffset.get(),
      deflectX.get(),
      deflectY.get(),
      vpW,
      vpH,
      horizX.get(),
    );
  });
  const auraCoords = motion?.auraCoords ?? fallbackAuras;

  const primaryAuraStyle = useAnimatedStyle(() => {
    const { c1x, c1y } = auraCoords.get();
    return {
      transform: [
        { translateX: c1x - PRIMARY_AURA_HALF },
        { translateY: c1y - PRIMARY_AURA_HALF },
        { scale: AURA_TEX_UPSAMPLE },
      ],
    };
  });

  const secondaryAuraStyle = useAnimatedStyle(() => {
    const { c2x, c2y } = auraCoords.get();
    return {
      transform: [
        { translateX: c2x - SECONDARY_AURA_HALF },
        { translateY: c2y - SECONDARY_AURA_HALF },
        { scale: AURA_TEX_UPSAMPLE },
      ],
    };
  });

  const auraEffects = useMemo(() => getAuraEffects(), []);
  const primaryUniforms = useMemo(
    () => ({ uSize: [PRIMARY_AURA_TEX_SIZE, PRIMARY_AURA_TEX_SIZE] }),
    [],
  );
  const secondaryUniforms = useMemo(
    () => ({ uSize: [SECONDARY_AURA_TEX_SIZE, SECONDARY_AURA_TEX_SIZE] }),
    [],
  );

  if (motion?.hasSharedBackground && !ignoreSharedBackground) {
    return (
      <View style={[styles.transparentContainer, style]} testID={testID}>
        {children}
      </View>
    );
  }

  const baseColors = variant === 'calm' ? CALM_BASE_COLORS : OCEAN_BASE_COLORS;
  const useSkiaAuras = Platform.OS !== 'web' && auraEffects.primary && auraEffects.secondary;

  return (
    <View style={[styles.container, style]} testID={testID}>
      <View style={styles.oceanLayer} pointerEvents="none">
        <LinearGradient
          colors={baseColors}
          locations={[0, 0.25, 0.52, 0.78, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <Animated.View style={[styles.primaryAuraHost, primaryAuraStyle]} pointerEvents="none">
        {useSkiaAuras ? (
          <Canvas style={styles.primaryAuraCanvas} pointerEvents="none">
            <Fill>
              <Shader source={auraEffects.primary!} uniforms={primaryUniforms} />
            </Fill>
          </Canvas>
        ) : (
          <LinearGradient
            colors={['rgba(56, 178, 255, 0.28)', 'rgba(17, 67, 148, 0.16)', 'rgba(0, 0, 0, 0)']}
            locations={[0, 0.45, 1]}
            style={styles.fallbackAura}
          />
        )}
      </Animated.View>

      <Animated.View style={[styles.secondaryAuraHost, secondaryAuraStyle]} pointerEvents="none">
        {useSkiaAuras ? (
          <Canvas style={styles.secondaryAuraCanvas} pointerEvents="none">
            <Fill>
              <Shader source={auraEffects.secondary!} uniforms={secondaryUniforms} />
            </Fill>
          </Canvas>
        ) : (
          <LinearGradient
            colors={['rgba(30, 108, 224, 0.22)', 'rgba(11, 46, 107, 0.12)', 'rgba(0, 0, 0, 0)']}
            locations={[0, 0.45, 1]}
            style={styles.fallbackAura}
          />
        )}
      </Animated.View>

      <View style={styles.content} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  transparentContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg.pureBlack,
    overflow: 'hidden',
  },
  oceanLayer: {
    position: 'absolute',
    top: -60,
    bottom: -60,
    left: '-12%',
    right: '-12%',
  },
  primaryAuraHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: PRIMARY_AURA_TEX_SIZE,
    height: PRIMARY_AURA_TEX_SIZE,
  },
  primaryAuraCanvas: {
    width: PRIMARY_AURA_TEX_SIZE,
    height: PRIMARY_AURA_TEX_SIZE,
  },
  secondaryAuraHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SECONDARY_AURA_TEX_SIZE,
    height: SECONDARY_AURA_TEX_SIZE,
  },
  secondaryAuraCanvas: {
    width: SECONDARY_AURA_TEX_SIZE,
    height: SECONDARY_AURA_TEX_SIZE,
  },
  fallbackAura: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  content: {
    flex: 1,
  },
});
