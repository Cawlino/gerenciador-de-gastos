import { Canvas, Fill, Shader } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeftRight, ChartPie, LayoutDashboard, Link2 } from 'lucide-react-native';
import React, { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { getThickGlassEffect } from '../shaders/thickGlassShader';
import { computeWanderingAuras, packGlassUniformKey, useMotion } from '../theme/MotionContext';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme/tokens';

export interface GlassTabRoute {
  key: string;
  name: string;
}

export interface GlassTabDescriptor {
  options: {
    title?: string;
    tabBarLabel?: string;
    tabBarAccessibilityLabel?: string;
    tabBarButtonTestID?: string;
    tabBarIcon?: (props: { focused: boolean; color: string; size: number }) => ReactNode;
  };
}

export interface GlassTabBarProps {
  state: {
    index: number;
    routes: GlassTabRoute[];
  };
  descriptors: Record<string, GlassTabDescriptor | undefined>;
  emitter?: {
    emit: (event: {
      type: 'tabPress';
      target: string;
      canPreventDefault: boolean;
    }) => { defaultPrevented: boolean };
  };
  navigateToTab?: (routeKey: string) => void;
  navigation?: {
    emit?: (event: {
      type: 'tabPress';
      target: string;
      canPreventDefault: boolean;
    }) => { defaultPrevented: boolean };
    navigate?: (routeName: string) => void;
  };
  insets?: {
    bottom?: number;
  };
}

const DEFAULT_META: Record<
  string,
  { label: string; renderIcon: (color: string, size: number) => ReactNode }
> = {
  index: {
    label: 'Painel',
    renderIcon: (color, size) => <LayoutDashboard color={color} size={size} />,
  },
  transactions: {
    label: 'Transações',
    renderIcon: (color, size) => <ArrowLeftRight color={color} size={size} />,
  },
  settings: {
    label: 'Conexão',
    renderIcon: (color, size) => <Link2 color={color} size={size} />,
  },
};

const DOCK_HEIGHT = 64;
const DOCK_RADIUS = 32;
const ROW_PADDING = 5;
const PILL_HEIGHT = 52;
const DOCK_TINT = [0.035, 0.055, 0.1, 0.72] as const;
const PILL_TINT = [0.08, 0.22, 0.44, 0.54] as const;
const PILL_RADIUS = 26;
const PILL_PAGE_SPRING = { damping: 26, stiffness: 255, mass: 0.86, energyThreshold: 2e-5 } as const;

/**
 * Barra inferior flutuante Liquid Glass (Skia Shader chanfrado espesso) com cápsula/bolinha
 * expansível ao segurar, arrastável entre abas em tempo real e encaixe magnético ao soltar.
 */
function GlassTabBarImpl({
  state,
  descriptors,
  emitter,
  navigateToTab,
  navigation,
  insets,
}: GlassTabBarProps) {
  const bottomOffset = Math.max(insets?.bottom ?? 0, SPACING.sm);
  const routes = state.routes;
  const routeCount = Math.max(routes.length, 1);
  const maxIndex = Math.max(routeCount - 1, 0);

  const motion = useMotion();
  const motionAuraCoords = motion?.auraCoords;
  const reducedMotion = useReducedMotion();
  const { width: rawWinW, height: rawWinH } = useWindowDimensions();
  const vpW = rawWinW > 0 ? rawWinW : 390;
  const vpH = rawWinH > 0 ? rawWinH : 840;
  const [dockWidth, setDockWidth] = useState(0);

  const thickEffect = useMemo(() => getThickGlassEffect(), []);
  const useLiquidGlass = Platform.OS !== 'web' && thickEffect !== null;

  const fallbackTabProgress = useSharedValue(state.index);
  const sharedTabProgress = motion ? motion.tabProgress : fallbackTabProgress;
  const fallbackDragging = useSharedValue(0);
  const isTabDragging = motion ? motion.isTabDragging : fallbackDragging;
  const fallbackScrollY = useSharedValue(0);
  const scrollYSV = motion ? motion.scrollY : fallbackScrollY;
  const fallbackPullOffset = useSharedValue(0);
  const pullOffsetSV = motion ? motion.pullOffset : fallbackPullOffset;
  const fallbackDeflectX = useSharedValue(0);
  const deflectXSV = motion ? motion.auraDeflectX : fallbackDeflectX;
  const fallbackDeflectY = useSharedValue(0);
  const deflectYSV = motion ? motion.auraDeflectY : fallbackDeflectY;
  const fallbackHorizX = useSharedValue(0);
  const horizXSV = motion ? motion.auraHorizX : fallbackHorizX;

  const innerWidth = Math.max(dockWidth - ROW_PADDING * 2, 0);
  const slotWidth = innerWidth > 0 ? innerWidth / routeCount : 0;

  const innerWidthSV = useSharedValue(innerWidth);
  const slotWidthSV = useSharedValue(slotWidth);
  const maxIndexSV = useSharedValue(maxIndex);
  const pillProgress = useSharedValue(state.index);
  const isPillDragging = useSharedValue(0);
  const pillScale = useSharedValue(1);
  const pillGlow = useSharedValue(0);
  const grabOffsetX = useSharedValue(0);
  const lastHoveredTab = useSharedValue(state.index);
  const velocityBoost = useSharedValue(0);

  useEffect(() => {
    innerWidthSV.set(innerWidth);
    slotWidthSV.set(slotWidth);
    maxIndexSV.set(maxIndex);
  }, [innerWidth, innerWidthSV, maxIndex, maxIndexSV, slotWidth, slotWidthSV]);

  // Espelha o progresso do pager quando o usuário não está arrastando diretamente a bolinha
  useAnimatedReaction(
    () => sharedTabProgress.get(),
    (next, prev) => {
      if (next === prev || isPillDragging.get() !== 0) return;
      pillProgress.set(next);
    },
  );

  // Em testes ou renders isolados (sem MotionProvider), acompanha mudanças externas de state.index
  useEffect(() => {
    if (!motion) {
      if (reducedMotion) {
        fallbackTabProgress.set(state.index);
        pillProgress.set(state.index);
      } else {
        fallbackTabProgress.set(
          withTiming(state.index, {
            duration: 280,
            easing: Easing.out(Easing.cubic),
          }),
        );
      }
    }
  }, [fallbackTabProgress, motion, pillProgress, reducedMotion, state.index]);

  const handleDockLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextW = Math.round(event.nativeEvent.layout.width);
      if (nextW > 0) {
        const nextInner = Math.max(nextW - ROW_PADDING * 2, 0);
        innerWidthSV.set(nextInner);
        slotWidthSV.set(nextInner / routeCount);
        setDockWidth((prev) => (prev === nextW ? prev : nextW));
      }
    },
    [innerWidthSV, routeCount, slotWidthSV],
  );

  const firePickupHaptic = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, []);

  const fireDetentHaptic = useCallback(() => {
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const fireSettleHaptic = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, []);

  const commitRouteIndex = useCallback(
    (targetIdx: number) => {
      const targetRoute = routes[targetIdx];
      if (!targetRoute) return;
      fireSettleHaptic();
      motion?.markGestureCommit?.(targetIdx);
      if (navigateToTab) {
        navigateToTab(targetRoute.key);
        return;
      }
      const event = emitter
        ? emitter.emit({ type: 'tabPress', target: targetRoute.key, canPreventDefault: true })
        : navigation?.emit?.({ type: 'tabPress', target: targetRoute.key, canPreventDefault: true });
      if (!event?.defaultPrevented) {
        navigation?.navigate?.(targetRoute.name);
      }
    },
    [emitter, fireSettleHaptic, motion, navigateToTab, navigation, routes],
  );

  const pillPanGesture = usePanGesture({
    activeOffsetX: [-10, 10],
    failOffsetY: [-18, 18],
    shouldCancelWhenOutside: false,
    enabled: routeCount > 1,
    onActivate: (event) => {
      'worklet';
      const sw = slotWidthSV.get();
      if (sw <= 1) return;
      const maxIdx = maxIndexSV.get();
      const localX = clamp(event.x - ROW_PADDING, 0, Math.max(innerWidthSV.get(), 1));
      const touchedTab = clamp(Math.floor(localX / sw), 0, maxIdx);
      const currentLeft = pillProgress.get() * sw;
      const grabbedOnCurrentPill =
        localX >= currentLeft - 8 && localX <= currentLeft + sw + 8;

      if (grabbedOnCurrentPill) {
        grabOffsetX.set(localX - currentLeft);
      } else {
        grabOffsetX.set(sw * 0.5);
      }

      isPillDragging.set(1);
      isTabDragging.set(1);
      lastHoveredTab.set(touchedTab);
      velocityBoost.set(0);

      if (reducedMotion) {
        pillScale.set(1.14);
        pillGlow.set(1);
      } else {
        pillScale.set(withSpring(1.24, { damping: 13, stiffness: 280, mass: 0.7 }));
        pillGlow.set(withSpring(1, { damping: 16, stiffness: 240 }));
      }
      scheduleOnRN(firePickupHaptic);
    },
    onUpdate: (event) => {
      'worklet';
      if (isPillDragging.get() === 0) return;
      const sw = Math.max(slotWidthSV.get(), 1);
      const maxIdx = maxIndexSV.get();
      const localX = event.x - ROW_PADDING;
      const nextLeft = localX - grabOffsetX.get();
      const nextProgress = clamp(nextLeft / sw, 0, maxIdx);

      pillProgress.set(nextProgress);
      sharedTabProgress.set(nextProgress);

      if (!reducedMotion) {
        velocityBoost.set(clamp(Math.abs(event.velocityX) / 4800, 0, 0.08));
      }

      const hovered = Math.round(nextProgress);
      if (hovered !== lastHoveredTab.get()) {
        lastHoveredTab.set(hovered);
        scheduleOnRN(fireDetentHaptic);
      }
    },
    onDeactivate: (event) => {
      'worklet';
      if (isPillDragging.get() === 0) {
        return;
      }

      const sw = Math.max(slotWidthSV.get(), 1);
      const maxIdx = maxIndexSV.get();
      const momentum = clamp((event.velocityX / sw) * 0.04, -0.32, 0.32);
      const targetIndex = Math.round(clamp(pillProgress.get() + momentum, 0, maxIdx));

      isPillDragging.set(0);
      isTabDragging.set(0);
      velocityBoost.set(0);

      if (reducedMotion) {
        pillProgress.set(targetIndex);
        sharedTabProgress.set(targetIndex);
        pillScale.set(1);
        pillGlow.set(0);
      } else {
        pillProgress.set(
          withSpring(targetIndex, {
            damping: 16,
            stiffness: 320,
            mass: 0.72,
          }),
        );
        sharedTabProgress.set(withSpring(targetIndex, PILL_PAGE_SPRING));
        pillScale.set(withSpring(1, { damping: 15, stiffness: 260 }));
        pillGlow.set(withTiming(0, { duration: 190 }));
      }

      scheduleOnRN(commitRouteIndex, targetIndex);
    },
    onFinalize: () => {
      'worklet';
      if (isPillDragging.get() === 0) {
        return;
      }
      const targetIndex = Math.round(clamp(pillProgress.get(), 0, maxIndexSV.get()));
      isPillDragging.set(0);
      isTabDragging.set(0);
      velocityBoost.set(0);
      pillScale.set(withSpring(1, { damping: 15, stiffness: 260 }));
      pillGlow.set(withTiming(0, { duration: 190 }));
      pillProgress.set(withSpring(targetIndex, { damping: 16, stiffness: 320, mass: 0.72 }));
      sharedTabProgress.set(withSpring(targetIndex, PILL_PAGE_SPRING));
      scheduleOnRN(commitRouteIndex, targetIndex);
    },
  });

  const pillAnimatedStyle = useAnimatedStyle(() => {
    const sw = slotWidthSV.get();
    const sc = pillScale.get();
    const vb = velocityBoost.get();
    const tx = pillProgress.get() * sw;
    const scX = sc + vb;
    const scY = sc - vb * 0.35;
    const liftY = (sc - 1) * -6;
    return {
      transform: [{ translateX: tx }, { translateY: liftY }, { scaleX: scX }, { scaleY: scY }],
    };
  });

  const haloAnimatedStyle = useAnimatedStyle(() => {
    const glow = pillGlow.get();
    return {
      opacity: glow,
      transform: [{ scale: 0.94 + glow * 0.14 }],
    };
  });

  const dockTopOnScreen = Math.max(
    vpH - Math.max(insets?.bottom ?? 0, SPACING.sm) - SPACING.xs - DOCK_HEIGHT,
    0,
  );
  const dockLeftOnScreen = Math.max((vpW - Math.max(dockWidth, 1)) * 0.5, 0);
  const pillTopOnScreen = dockTopOnScreen + (DOCK_HEIGHT - PILL_HEIGHT) * 0.5;
  const pillSizeW = Math.max(Math.round(slotWidth), 40);

  const dockCfgSV = useSharedValue({
    dockW: Math.max(dockWidth, 1),
    pillW: pillSizeW,
    dockLeft: dockLeftOnScreen,
    dockTop: dockTopOnScreen,
    pillTop: pillTopOnScreen,
    vpW,
    vpH,
    dockSizeArr: [Math.max(dockWidth, 1), DOCK_HEIGHT] as readonly [number, number],
    pillSizeArr: [pillSizeW, PILL_HEIGHT] as readonly [number, number],
    dockOriginArr: [dockLeftOnScreen, dockTopOnScreen] as readonly [number, number],
    viewportArr: [vpW, vpH] as readonly [number, number],
    ver: 0,
  });

  useEffect(() => {
    dockCfgSV.set((prev) => ({
      dockW: Math.max(dockWidth, 1),
      pillW: pillSizeW,
      dockLeft: dockLeftOnScreen,
      dockTop: dockTopOnScreen,
      pillTop: pillTopOnScreen,
      vpW,
      vpH,
      dockSizeArr: [Math.max(dockWidth, 1), DOCK_HEIGHT],
      pillSizeArr: [pillSizeW, PILL_HEIGHT],
      dockOriginArr: [dockLeftOnScreen, dockTopOnScreen],
      viewportArr: [vpW, vpH],
      ver: prev.ver + 1,
    }));
  }, [dockCfgSV, dockLeftOnScreen, dockTopOnScreen, dockWidth, pillSizeW, pillTopOnScreen, vpH, vpW]);

  const dockUniforms = useSharedValue({
    uSize: [Math.max(dockWidth, 1), DOCK_HEIGHT] as readonly [number, number],
    uRadius: DOCK_RADIUS,
    uBevel: 5.0,
    uScreenOrigin: [dockLeftOnScreen, dockTopOnScreen] as readonly [number, number],
    uViewport: [vpW, vpH] as readonly [number, number],
    uAura1: [vpW * 0.38, vpH * 0.16] as readonly [number, number],
    uAura2: [vpW * 0.84, vpH * 0.63] as readonly [number, number],
    uTint: DOCK_TINT as readonly [number, number, number, number],
    uHighlight: 0.92,
    uChromatic: 0.28,
  });

  const pillUniforms = useSharedValue({
    uSize: [pillSizeW, PILL_HEIGHT] as readonly [number, number],
    uRadius: PILL_RADIUS,
    uBevel: 4.0,
    uScreenOrigin: [dockLeftOnScreen + ROW_PADDING, pillTopOnScreen] as readonly [number, number],
    uViewport: [vpW, vpH] as readonly [number, number],
    uAura1: [vpW * 0.38, vpH * 0.16] as readonly [number, number],
    uAura2: [vpW * 0.84, vpH * 0.63] as readonly [number, number],
    uTint: PILL_TINT as readonly [number, number, number, number],
    uHighlight: 1.16,
    uChromatic: 0.4,
  });

  // Deadband numérico sem alocação de string/objeto extra nos worklets 120Hz da dock e cápsula
  useAnimatedReaction(
    (): number => {
      const cfg = dockCfgSV.get();
      if (cfg.dockW <= 1) return -1;
      const a = motionAuraCoords
        ? motionAuraCoords.get()
        : computeWanderingAuras(
            scrollYSV.get(),
            sharedTabProgress.get(),
            pullOffsetSV.get(),
            deflectXSV.get(),
            deflectYSV.get(),
            cfg.vpW,
            cfg.vpH,
            horizXSV.get(),
          );
      return packGlassUniformKey(
        Math.round(a.c1x * 2),
        Math.round(a.c1y * 2),
        Math.round(a.c2x * 2),
        Math.round(a.c2y * 2),
        0,
        0,
        cfg.ver,
      );
    },
    (nextKey, prevKey) => {
      if (nextKey < 0 || nextKey === prevKey) return;
      const cfg = dockCfgSV.get();
      const a = motionAuraCoords
        ? motionAuraCoords.get()
        : computeWanderingAuras(
            scrollYSV.get(),
            sharedTabProgress.get(),
            pullOffsetSV.get(),
            deflectXSV.get(),
            deflectYSV.get(),
            cfg.vpW,
            cfg.vpH,
            horizXSV.get(),
          );
      dockUniforms.set({
        uSize: cfg.dockSizeArr,
        uRadius: DOCK_RADIUS,
        uBevel: 5.0,
        uScreenOrigin: cfg.dockOriginArr,
        uViewport: cfg.viewportArr,
        uAura1: [a.c1x, a.c1y] as const,
        uAura2: [a.c2x, a.c2y] as const,
        uTint: DOCK_TINT,
        uHighlight: 0.92,
        uChromatic: 0.28,
      });
    },
  );

  useAnimatedReaction(
    (): number => {
      const cfg = dockCfgSV.get();
      if (cfg.dockW <= 1) return -1;
      const sw = slotWidthSV.get();
      const px = pillProgress.get();
      const a = motionAuraCoords
        ? motionAuraCoords.get()
        : computeWanderingAuras(
            scrollYSV.get(),
            sharedTabProgress.get(),
            pullOffsetSV.get(),
            deflectXSV.get(),
            deflectYSV.get(),
            cfg.vpW,
            cfg.vpH,
            horizXSV.get(),
          );
      return packGlassUniformKey(
        Math.round(px * sw * 2),
        Math.round(a.c1x * 2),
        Math.round(a.c1y * 2),
        Math.round(a.c2x * 2),
        Math.round(a.c2y * 2),
        0,
        cfg.ver,
      );
    },
    (nextKey, prevKey) => {
      if (nextKey < 0 || nextKey === prevKey) return;
      const cfg = dockCfgSV.get();
      const sw = slotWidthSV.get();
      const px = pillProgress.get();
      const a = motionAuraCoords
        ? motionAuraCoords.get()
        : computeWanderingAuras(
            scrollYSV.get(),
            sharedTabProgress.get(),
            pullOffsetSV.get(),
            deflectXSV.get(),
            deflectYSV.get(),
            cfg.vpW,
            cfg.vpH,
            horizXSV.get(),
          );
      pillUniforms.set({
        uSize: cfg.pillSizeArr,
        uRadius: PILL_RADIUS,
        uBevel: 4.0,
        uScreenOrigin: [cfg.dockLeft + ROW_PADDING + px * sw, cfg.pillTop] as const,
        uViewport: cfg.viewportArr,
        uAura1: [a.c1x, a.c1y] as const,
        uAura2: [a.c2x, a.c2y] as const,
        uTint: PILL_TINT,
        uHighlight: 1.16,
        uChromatic: 0.4,
      });
    },
  );

  const handleTabPress = useCallback(
    (routeKey: string, routeName: string, isFocused: boolean) => {
      const event = emitter
        ? emitter.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true })
        : navigation?.emit?.({ type: 'tabPress', target: routeKey, canPreventDefault: true });

      if (!isFocused && !event?.defaultPrevented) {
        void Haptics.selectionAsync().catch(() => undefined);
        if (navigateToTab) {
          navigateToTab(routeKey);
        } else {
          navigation?.navigate?.(routeName);
        }
      }
    },
    [emitter, navigateToTab, navigation],
  );

  const tabItems = useMemo(
    () =>
      routes.map((route, idx) => {
        const isFocused = state.index === idx;
        const descriptor = descriptors[route.key];
        const options = descriptor?.options ?? {};

        const fallback = DEFAULT_META[route.name];
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : (options.title ?? fallback?.label ?? route.name);

        const iconColor = isFocused ? COLORS.accent.ice : COLORS.text.secondary;
        const textColor = isFocused ? COLORS.text.primary : COLORS.text.secondary;

        const icon = options.tabBarIcon
          ? options.tabBarIcon({ focused: isFocused, color: iconColor, size: 20 })
          : fallback
            ? fallback.renderIcon(iconColor, 20)
            : <ChartPie size={20} color={iconColor} />;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            testID={options.tabBarButtonTestID ?? `tab-${route.name}`}
            onPress={() => handleTabPress(route.key, route.name, isFocused)}
            style={styles.tabButton}
          >
            <View style={styles.tabInner}>
              {icon}
              <Text
                style={[
                  styles.label,
                  {
                    color: textColor,
                    fontFamily: isFocused ? TYPOGRAPHY.family.semibold : TYPOGRAPHY.family.medium,
                  },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          </Pressable>
        );
      }),
    [descriptors, handleTabPress, routes, state.index],
  );

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomOffset }]} pointerEvents="box-none" testID="glass-tab-bar">
      <LinearGradient
        colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.70)', 'rgba(0, 0, 0, 0.94)']}
        locations={[0, 0.52, 1]}
        pointerEvents="none"
        style={[styles.edgeScrim, { height: bottomOffset + 86 }]}
      />

      <GestureDetector gesture={pillPanGesture}>
        <View style={styles.dockStage} onLayout={handleDockLayout}>
          <View style={styles.dockBackdropClip} pointerEvents="none">
            {useLiquidGlass && thickEffect ? (
              <Canvas
                pointerEvents="none"
                testID="glass-tab-bar-liquid"
                style={[StyleSheet.absoluteFill, { opacity: dockWidth > 0 ? 1 : 0 }]}
              >
                <Fill>
                  <Shader source={thickEffect} uniforms={dockUniforms} />
                </Fill>
              </Canvas>
            ) : (
              <View style={styles.fallbackDockBg} testID="glass-tab-bar-fallback" />
            )}
          </View>

          {slotWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.floatingPill,
                {
                  left: ROW_PADDING,
                  width: slotWidth,
                },
                pillAnimatedStyle,
              ]}
            >
              <Animated.View style={[styles.pillExpansionHalo, haloAnimatedStyle]} />
              <View style={styles.pillGlassClip}>
                {useLiquidGlass && thickEffect ? (
                  <Canvas style={StyleSheet.absoluteFill}>
                    <Fill>
                      <Shader source={thickEffect} uniforms={pillUniforms} />
                    </Fill>
                  </Canvas>
                ) : (
                  <View style={styles.fallbackActivePill} />
                )}
              </View>
            </Animated.View>
          ) : null}

          <View style={styles.row}>{tabItems}</View>
        </View>
      </GestureDetector>
    </View>
  );
}

export const GlassTabBar = React.memo(GlassTabBarImpl);

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  edgeScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  dockStage: {
    width: '100%',
    maxWidth: 420,
    height: DOCK_HEIGHT,
    position: 'relative',
    justifyContent: 'center',
  },
  dockBackdropClip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: DOCK_RADIUS,
    overflow: 'hidden',
    backgroundColor: 'rgba(6, 13, 28, 0.45)',
  },
  fallbackDockBg: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: DOCK_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderTopColor: 'rgba(255, 255, 255, 0.24)',
    backgroundColor: 'rgba(9, 14, 24, 0.84)',
  },
  floatingPill: {
    position: 'absolute',
    top: (DOCK_HEIGHT - PILL_HEIGHT) / 2,
    height: PILL_HEIGHT,
    borderRadius: PILL_RADIUS,
    zIndex: 1,
  },
  pillExpansionHalo: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    left: -4,
    right: -4,
    borderRadius: PILL_RADIUS + 4,
    backgroundColor: 'rgba(56, 189, 248, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(186, 230, 253, 0.46)',
  },
  pillGlassClip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: PILL_RADIUS,
    overflow: 'hidden',
  },
  fallbackActivePill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: PILL_RADIUS,
    backgroundColor: 'rgba(30, 108, 224, 0.28)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(186, 230, 253, 0.36)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: DOCK_HEIGHT,
    paddingHorizontal: ROW_PADDING,
    zIndex: 2,
  },
  tabButton: {
    flex: 1,
    height: PILL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: PILL_RADIUS,
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: SPACING.xs,
  },
  label: {
    fontSize: TYPOGRAPHY.size.micro,
    lineHeight: TYPOGRAPHY.lineHeight.micro,
  },
});
