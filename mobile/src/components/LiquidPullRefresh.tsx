import * as Haptics from 'expo-haptics';
import { RefreshCw } from 'lucide-react-native';
import React, {
  type ComponentRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import {
  GestureDetector,
  InterceptingGestureDetector,
  type PanGesture,
  useNativeGesture,
  usePanGesture,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  clamp,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ScrollOffsetProvider, useMotion, useTabSlotIndex } from '../theme/MotionContext';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme/tokens';

const PULL_THRESHOLD = 80;
const PULL_MAX = 156;
const REFRESH_REST_HEIGHT = 64;

const TOP_BOUNCE_MAX = 56;
const BOTTOM_BOUNCE_MAX = 88;
const ELASTIC_BOUNCE_SPRING = { damping: 12.5, stiffness: 215, mass: 0.9 } as const;
const PULL_CANCEL_SPRING = { damping: 14, stiffness: 235, mass: 0.9 } as const;

function getWorkletNow(): number {
  'worklet';
  const g = globalThis as unknown as {
    __frameTimestamp?: number;
    _getAnimationTimestamp?: () => number;
  };
  if (typeof g.__frameTimestamp === 'number' && g.__frameTimestamp > 0) {
    return g.__frameTimestamp;
  }
  if (typeof g._getAnimationTimestamp === 'function') {
    return g._getAnimationTimestamp();
  }
  return Date.now();
}

export type ScrollEventHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

export interface LiquidPullScrollMetrics {
  scrollY: SharedValue<number>;
  contentHeight: SharedValue<number>;
  layoutHeight: SharedValue<number>;
  maxScrollY: SharedValue<number>;
}

export interface LiquidPullRefreshBind {
  simultaneousWith: PanGesture;
  overScrollMode: 'never';
  bounces: false;
  onLayout: (event: LayoutChangeEvent) => void;
  onContentSizeChange: (_width: number, height: number) => void;
  wrapScroll: (handler?: ScrollEventHandler) => ScrollEventHandler;
  scrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
  scrollMetrics: LiquidPullScrollMetrics;
}

export interface LiquidPullRefreshProps {
  refreshing: boolean;
  onRefresh: () => void;
  scrollYSV: SharedValue<number>;
  children: (bind: LiquidPullRefreshBind) => React.ReactNode;
  testID?: string;
}

/**
 * Container com Pull-to-Refresh + efeito elástico (rubber-band iOS) no topo e no fundo.
 * Absorve arrastes contínuos além das extremidades e impactos de inércia (fling) com retorno
 * via `withSpring`, sem usar o spinner ou glow nativo do Android.
 */
export function LiquidPullRefresh({
  refreshing,
  onRefresh,
  scrollYSV,
  children,
  testID = 'liquid-pull-refresh',
}: LiquidPullRefreshProps) {
  const motion = useMotion();
  const tabSlot = useTabSlotIndex();
  const motionScrollY = motion?.scrollY;
  const motionPullOffset = motion?.pullOffset;
  const tabScrollSlotSV =
    tabSlot >= 0 && tabSlot <= 2 && motion?.tabScrollY ? motion.tabScrollY[tabSlot] : null;
  const tabPullSlotSV =
    tabSlot >= 0 && tabSlot <= 2 && motion?.tabPullOffset ? motion.tabPullOffset[tabSlot] : null;
  const reducedMotion = useReducedMotion();

  const pullY = useSharedValue(0);
  const overscrollY = useSharedValue(0);
  const overscrollStartSV = useSharedValue(0);
  const localPullOffsetSV = useSharedValue(0);

  const isAtTopOnBegin = useSharedValue(0);
  const pullStartAbsY = useSharedValue(0);
  const isActivePull = useSharedValue(0);
  const isTouchingSV = useSharedValue(0);
  const thresholdCrossed = useSharedValue(0);
  const refreshingSV = useSharedValue(refreshing ? 1 : 0);
  const spinAngle = useSharedValue(0);

  const layoutHeightSV = useSharedValue(0);
  const contentHeightSV = useSharedValue(0);
  const maxScrollYSV = useSharedValue(0);

  const handledReleaseSV = useSharedValue(0);
  const edgeBounceFromDeactivateSV = useSharedValue(0);
  const topContactSV = useSharedValue(0);
  const topAnchorTransY = useSharedValue(0);
  const bottomContactSV = useSharedValue(0);
  const bottomAnchorTransY = useSharedValue(0);

  const lastTouchReleaseTs = useSharedValue(0);
  const lastScrollSampleY = useSharedValue(0);
  const lastScrollSampleTs = useSharedValue(0);
  const rollingVelocityY = useSharedValue(0);
  const lastEdgeBounceTs = useSharedValue(0);

  const [readyLabel, setReadyLabel] = useState(false);

  const fireThresholdHaptic = useCallback(() => {
    setReadyLabel(true);
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const clearReadyLabel = useCallback(() => {
    setReadyLabel(false);
  }, []);

  const triggerRefresh = useCallback(() => {
    setReadyLabel(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    onRefresh();
  }, [onRefresh]);

  useEffect(() => {
    refreshingSV.set(refreshing ? 1 : 0);
    if (refreshing) {
      pullY.set(
        reducedMotion
          ? REFRESH_REST_HEIGHT
          : withSpring(REFRESH_REST_HEIGHT, { damping: 20, stiffness: 250, mass: 0.85 }),
      );
      if (!reducedMotion) {
        spinAngle.set(
          withRepeat(
            withTiming(360, { duration: 900, easing: Easing.linear }),
            -1,
            false,
          ),
        );
      }
    } else {
      spinAngle.set(0);
      pullY.set(
        reducedMotion
          ? 0
          : withSpring(0, { damping: 18, stiffness: 260, mass: 0.85 }),
      );
    }
  }, [pullY, reducedMotion, refreshing, refreshingSV, spinAngle]);

  useAnimatedReaction(
    () => pullY.get() + overscrollY.get(),
    (val) => {
      localPullOffsetSV.set(val);
      if (tabPullSlotSV) {
        tabPullSlotSV.set(val);
      } else {
        motionPullOffset?.set(val);
      }
    },
  );

  const handleChildLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const lh = event.nativeEvent?.layout?.height ?? 0;
      if (lh > 0) {
        layoutHeightSV.set(lh);
        const ch = contentHeightSV.get();
        if (ch > 0) {
          maxScrollYSV.set(Math.max(0, ch - lh));
        }
      }
    },
    [contentHeightSV, layoutHeightSV, maxScrollYSV],
  );

  const handleChildContentSizeChange = useCallback(
    (_width: number, height: number) => {
      if (height > 0) {
        contentHeightSV.set(height);
        const lh = layoutHeightSV.get();
        if (lh > 0) {
          maxScrollYSV.set(Math.max(0, height - lh));
        }
      }
    },
    [contentHeightSV, layoutHeightSV, maxScrollYSV],
  );

  const applyScrollMetricsWorklet = useCallback(
    (nextY: number, ch: number, lh: number, now: number) => {
      'worklet';
      const clampedY = nextY < 0 ? 0 : nextY;
      scrollYSV.set(clampedY);
      if (tabScrollSlotSV) {
        tabScrollSlotSV.set(clampedY);
      } else {
        motionScrollY?.set(clampedY);
      }

      if (ch > 0 && lh > 0) {
        contentHeightSV.set(ch);
        layoutHeightSV.set(lh);
        maxScrollYSV.set(Math.max(0, ch - lh));
      }

      const prevY = lastScrollSampleY.get();
      const prevTs = lastScrollSampleTs.get();
      const dt = now - prevTs;
      const dy = nextY - prevY;
      const maxY = ch > 0 && lh > 0 ? Math.max(0, ch - lh) : maxScrollYSV.get();

      lastScrollSampleY.set(nextY);
      lastScrollSampleTs.set(now);

      // Reseta velocidade em primeiro tick, pausas ou saltos programáticos (ex.: troca de filtro/mês)
      if (prevTs <= 0 || dt <= 0 || dt > 140 || Math.abs(dy) > 360) {
        rollingVelocityY.set(0);
        return;
      }

      const instVel = (dy / Math.max(8, dt)) * 1000;
      const smoothVel = rollingVelocityY.get() * 0.45 + instVel * 0.55;
      rollingVelocityY.set(smoothVel);

      if (
        reducedMotion ||
        isTouchingSV.get() === 1 ||
        isActivePull.get() === 1 ||
        edgeBounceFromDeactivateSV.get() === 1
      ) {
        return;
      }

      const recentlyReleased = now - lastTouchReleaseTs.get() < 2200;
      const bounceCooldownOk = now - lastEdgeBounceTs.get() > 260;
      if (!recentlyReleased || !bounceCooldownOk) {
        return;
      }

      // Batida de inércia (fling) ao retornar para o topo sem acionar o Pull-to-Refresh
      if (prevY > 2.5 && nextY <= 1.5 && smoothVel < -210 && refreshingSV.get() === 0) {
        const impact = clamp(Math.abs(smoothVel) * 0.017, 14, 44);
        lastEdgeBounceTs.set(now);
        rollingVelocityY.set(0);
        overscrollY.set(
          withSequence(
            withTiming(impact, { duration: 92, easing: Easing.out(Easing.cubic) }),
            withSpring(0, { ...ELASTIC_BOUNCE_SPRING, velocity: -impact * 4 }),
          ),
        );
        return;
      }

      // Batida de inércia (fling) ao chegar no fim da lista
      if (maxY > 12 && prevY < maxY - 2.5 && nextY >= maxY - 1.5 && smoothVel > 210) {
        const impact = clamp(smoothVel * 0.017, 14, 48);
        lastEdgeBounceTs.set(now);
        rollingVelocityY.set(0);
        overscrollY.set(
          withSequence(
            withTiming(-impact, { duration: 92, easing: Easing.out(Easing.cubic) }),
            withSpring(0, { ...ELASTIC_BOUNCE_SPRING, velocity: impact * 4 }),
          ),
        );
      }
    },
    [
      contentHeightSV,
      edgeBounceFromDeactivateSV,
      isActivePull,
      isTouchingSV,
      lastEdgeBounceTs,
      lastScrollSampleTs,
      lastScrollSampleY,
      lastTouchReleaseTs,
      layoutHeightSV,
      maxScrollYSV,
      motionScrollY,
      overscrollY,
      reducedMotion,
      refreshingSV,
      rollingVelocityY,
      scrollYSV,
      tabScrollSlotSV,
    ],
  );

  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const now = getWorkletNow();
        const nextY = event.contentOffset?.y ?? 0;
        const ch = event.contentSize?.height ?? 0;
        const lh = event.layoutMeasurement?.height ?? 0;
        applyScrollMetricsWorklet(nextY, ch, lh, now);
      },
    },
    [applyScrollMetricsWorklet],
  );

  const reportScrollMetrics = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const native = event.nativeEvent;
      const nextY = native?.contentOffset?.y ?? 0;
      const ch = native?.contentSize?.height ?? 0;
      const lh = native?.layoutMeasurement?.height ?? 0;
      applyScrollMetricsWorklet(nextY, ch, lh, getWorkletNow());
    },
    [applyScrollMetricsWorklet],
  );

  const wrapScroll = useCallback(
    (handler?: ScrollEventHandler): ScrollEventHandler =>
      (event) => {
        reportScrollMetrics(event);
        handler?.(event);
      },
    [reportScrollMetrics],
  );

  const pullPan = usePanGesture({
    activeOffsetY: [-12, 14],
    failOffsetX: [-10, 10],
    onBegin: (event) => {
      'worklet';
      pullStartAbsY.set(event.absoluteY);
      isTouchingSV.set(1);
      handledReleaseSV.set(0);
      edgeBounceFromDeactivateSV.set(0);
      cancelAnimation(overscrollY);
      overscrollStartSV.set(overscrollY.get());
      const sy = scrollYSV.get();
      const maxY = maxScrollYSV.get();
      const hasBounds = layoutHeightSV.get() > 0;
      isAtTopOnBegin.set(sy <= 2 ? 1 : 0);
      topContactSV.set(0);
      topAnchorTransY.set(0);
      if (hasBounds && sy >= maxY - 2) {
        bottomContactSV.set(1);
        bottomAnchorTransY.set(0);
      } else {
        bottomContactSV.set(0);
        bottomAnchorTransY.set(0);
      }
      thresholdCrossed.set(0);
    },
    onActivate: (event) => {
      'worklet';
      // Android PanGestureHandler chama resetProgress() em activate(), zerando event.translationY.
      // Usamos delta absoluto desde onBegin para detectar puxão para baixo sem disparar em scroll normal para cima.
      const totalDy = event.absoluteY - pullStartAbsY.get();
      if (
        isAtTopOnBegin.get() === 1 &&
        scrollYSV.get() <= 2 &&
        refreshingSV.get() === 0 &&
        (totalDy > 4 || event.translationY > 4)
      ) {
        isActivePull.set(1);
      } else {
        isActivePull.set(0);
      }
    },
    onUpdate: (event) => {
      'worklet';
      const totalDy = event.absoluteY - pullStartAbsY.get();
      if (
        isActivePull.get() === 0 &&
        isAtTopOnBegin.get() === 1 &&
        scrollYSV.get() <= 2 &&
        refreshingSV.get() === 0 &&
        totalDy > 10 &&
        bottomContactSV.get() === 0
      ) {
        isActivePull.set(1);
      }

      // 1) Fluxo de Pull-to-Refresh no topo (quando o toque iniciou já no topo)
      if (isActivePull.get() === 1) {
        const dy = Math.max(0, totalDy, event.translationY);
        const elastic = PULL_MAX * (1 - Math.exp(-dy / 210));
        pullY.set(elastic);

        if (elastic >= PULL_THRESHOLD && thresholdCrossed.get() === 0) {
          thresholdCrossed.set(1);
          scheduleOnRN(fireThresholdHaptic);
        } else if (elastic < PULL_THRESHOLD && thresholdCrossed.get() === 1) {
          thresholdCrossed.set(0);
          scheduleOnRN(clearReadyLabel);
        }
        return;
      }

      if (reducedMotion) {
        return;
      }

      const sy = scrollYSV.get();
      const maxY = maxScrollYSV.get();
      const hasBounds = layoutHeightSV.get() > 0;

      // 2) Overscroll elástico no FUNDO além de maxScrollY
      if (hasBounds && sy >= maxY - 2) {
        if (bottomContactSV.get() === 0) {
          bottomContactSV.set(1);
          bottomAnchorTransY.set(event.translationY);
        }
        const extraUp = bottomAnchorTransY.get() - event.translationY;
        const startStretch = overscrollStartSV.get() < 0 ? -overscrollStartSV.get() : 0;
        const rawStretch = extraUp + startStretch * 1.4;
        if (rawStretch > 0) {
          const elasticUp = -BOTTOM_BOUNCE_MAX * (1 - Math.exp(-rawStretch / 185));
          overscrollY.set(elasticUp);
          return;
        }
      } else {
        bottomContactSV.set(0);
        bottomAnchorTransY.set(event.translationY);
      }

      // 3) Overscroll elástico leve no TOPO quando o usuário arrasta vindo de baixo (sem acionar refresh)
      if (isAtTopOnBegin.get() === 0 && sy <= 2 && refreshingSV.get() === 0) {
        if (topContactSV.get() === 0) {
          topContactSV.set(1);
          topAnchorTransY.set(event.translationY);
        }
        const extraDown = event.translationY - topAnchorTransY.get();
        const startDown = overscrollStartSV.get() > 0 ? overscrollStartSV.get() : 0;
        const rawDown = extraDown + startDown * 1.4;
        if (rawDown > 0) {
          const elasticDown = TOP_BOUNCE_MAX * (1 - Math.exp(-rawDown / 170));
          overscrollY.set(elasticDown);
          return;
        }
      } else {
        topContactSV.set(0);
        topAnchorTransY.set(event.translationY);
      }

      overscrollStartSV.set(0);
      if (overscrollY.get() !== 0) {
        overscrollY.set(0);
      }
    },
    onDeactivate: (event) => {
      'worklet';
      handledReleaseSV.set(1);
      isTouchingSV.set(0);
      lastTouchReleaseTs.set(getWorkletNow());

      if (isActivePull.get() === 1) {
        isActivePull.set(0);
        if (pullY.get() >= PULL_THRESHOLD) {
          pullY.set(
            reducedMotion
              ? REFRESH_REST_HEIGHT
              : withSpring(REFRESH_REST_HEIGHT, { damping: 20, stiffness: 260, mass: 0.85 }),
          );
          scheduleOnRN(triggerRefresh);
        } else {
          pullY.set(
            reducedMotion
              ? 0
              : withSpring(0, PULL_CANCEL_SPRING),
          );
        }
      }

      if (reducedMotion) {
        overscrollY.set(0);
        return;
      }

      const curOver = overscrollY.get();
      if (curOver !== 0) {
        edgeBounceFromDeactivateSV.set(1);
        lastEdgeBounceTs.set(getWorkletNow());
        overscrollY.set(
          withSpring(0, {
            ...ELASTIC_BOUNCE_SPRING,
            velocity: clamp(event.velocityY * 0.35, -1200, 1200),
          }),
        );
        return;
      }

      // Flick rápido finalizado já encostado no fundo ou no topo (sem espaço extra para esticar antes de soltar)
      const sy = scrollYSV.get();
      const maxY = maxScrollYSV.get();
      const hasBounds = layoutHeightSV.get() > 0;
      if (hasBounds && maxY > 12) {
        if (sy >= maxY - 3 && event.velocityY < -260) {
          const impact = clamp(Math.abs(event.velocityY) * 0.017, 14, 48);
          edgeBounceFromDeactivateSV.set(1);
          lastEdgeBounceTs.set(getWorkletNow());
          overscrollY.set(
            withSequence(
              withTiming(-impact, { duration: 92, easing: Easing.out(Easing.cubic) }),
              withSpring(0, { ...ELASTIC_BOUNCE_SPRING, velocity: impact * 4 }),
            ),
          );
        } else if (isAtTopOnBegin.get() === 0 && sy <= 2 && event.velocityY > 260 && refreshingSV.get() === 0) {
          const impact = clamp(event.velocityY * 0.017, 14, 44);
          edgeBounceFromDeactivateSV.set(1);
          lastEdgeBounceTs.set(getWorkletNow());
          overscrollY.set(
            withSequence(
              withTiming(impact, { duration: 92, easing: Easing.out(Easing.cubic) }),
              withSpring(0, { ...ELASTIC_BOUNCE_SPRING, velocity: -impact * 4 }),
            ),
          );
        }
      }
    },
    onFinalize: () => {
      'worklet';
      isTouchingSV.set(0);
      if (thresholdCrossed.get() === 1) {
        thresholdCrossed.set(0);
        scheduleOnRN(clearReadyLabel);
      }
      if (handledReleaseSV.get() === 1) {
        return;
      }
      lastTouchReleaseTs.set(getWorkletNow());
      if (isActivePull.get() === 1) {
        isActivePull.set(0);
        if (refreshingSV.get() === 0) {
          pullY.set(
            reducedMotion
              ? 0
              : withSpring(0, PULL_CANCEL_SPRING),
          );
        }
      }
      if (overscrollY.get() !== 0) {
        overscrollY.set(
          reducedMotion
            ? 0
            : withSpring(0, ELASTIC_BOUNCE_SPRING),
        );
      }
    },
  });

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pullY.get() + overscrollY.get() }],
  }));

  const pillAnimatedStyle = useAnimatedStyle(() => {
    const py = pullY.get();
    const progress = interpolate(py, [14, PULL_THRESHOLD], [0, 1], Extrapolation.CLAMP);
    const scale = interpolate(py, [10, PULL_THRESHOLD], [0.84, 1], Extrapolation.CLAMP);
    const translateY = interpolate(
      py,
      [0, PULL_THRESHOLD, PULL_MAX],
      [-18, 18, 30],
      Extrapolation.CLAMP,
    );
    return {
      opacity: refreshingSV.get() === 1 ? 1 : progress,
      transform: [{ translateY }, { scale }],
    };
  });

  const iconAnimatedStyle = useAnimatedStyle(() => {
    if (refreshingSV.get() === 1) {
      return { transform: [{ rotate: `${spinAngle.get()}deg` }] };
    }
    const deg = interpolate(pullY.get(), [0, PULL_THRESHOLD], [0, 220], Extrapolation.CLAMP);
    return { transform: [{ rotate: `${deg}deg` }] };
  });

  const pillStatusText = refreshing
    ? 'Sincronizando...'
    : readyLabel
      ? 'Solte para atualizar'
      : 'Puxe para atualizar';

  const scrollMetrics = useMemo<LiquidPullScrollMetrics>(
    () => ({
      scrollY: scrollYSV,
      contentHeight: contentHeightSV,
      layoutHeight: layoutHeightSV,
      maxScrollY: maxScrollYSV,
    }),
    [contentHeightSV, layoutHeightSV, maxScrollYSV, scrollYSV],
  );

  const pullBind = useMemo<LiquidPullRefreshBind>(
    () => ({
      simultaneousWith: pullPan,
      overScrollMode: 'never',
      bounces: false,
      onLayout: handleChildLayout,
      onContentSizeChange: handleChildContentSizeChange,
      wrapScroll,
      scrollHandler,
      scrollMetrics,
    }),
    [
      handleChildContentSizeChange,
      handleChildLayout,
      pullPan,
      scrollHandler,
      scrollMetrics,
      wrapScroll,
    ],
  );

  return (
    <View
      style={styles.root}
      testID={testID}
      accessibilityActions={[{ name: 'activate', label: 'Atualizar dados' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate') {
          onRefresh();
        }
      }}
    >
      <Animated.View pointerEvents="none" style={[styles.indicatorHost, pillAnimatedStyle]}>
        <View style={styles.glassPill}>
          <Animated.View style={iconAnimatedStyle}>
            <RefreshCw
              size={14}
              color={refreshing || readyLabel ? COLORS.accent.ice : COLORS.text.secondary}
            />
          </Animated.View>
          <Text style={[styles.pillText, readyLabel || refreshing ? styles.pillTextActive : null]}>
            {pillStatusText}
          </Text>
        </View>
      </Animated.View>

      <GestureDetector gesture={pullPan}>
        <Animated.View style={[styles.contentWrap, contentAnimatedStyle]}>
          <ScrollOffsetProvider scrollY={scrollYSV} pullOffset={localPullOffsetSV}>
            {children(pullBind)}
          </ScrollOffsetProvider>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export interface LiquidPullScrollViewProps extends Omit<ScrollViewProps, 'ref'> {
  pullBind: LiquidPullRefreshBind;
  ref?: React.Ref<ComponentRef<typeof Animated.ScrollView>>;
}

export function LiquidPullScrollView({
  pullBind,
  onScroll,
  onScrollEndDrag,
  onMomentumScrollEnd,
  onLayout,
  onContentSizeChange,
  ref,
  ...rest
}: LiquidPullScrollViewProps) {
  const nativeGesture = useNativeGesture({
    disallowInterruption: false,
    shouldCancelWhenOutside: false,
    disableReanimated: true,
    simultaneousWith: pullBind.simultaneousWith,
  });

  const { scrollMetrics, onLayout: bindOnLayout, onContentSizeChange: bindOnContentSizeChange } =
    pullBind;
  const {
    scrollY: metricScrollY,
    contentHeight: metricContentHeight,
    layoutHeight: metricLayoutHeight,
    maxScrollY: metricMaxScrollY,
  } = scrollMetrics;

  const onScrollRef = useRef(onScroll);
  const hasJsScrollSV = useSharedValue(0);

  useEffect(() => {
    onScrollRef.current = onScroll;
    hasJsScrollSV.set(onScroll ? 1 : 0);
  }, [hasJsScrollSV, onScroll]);

  const forwardJsScroll = useCallback((y: number, ch: number, lh: number) => {
    onScrollRef.current?.({
      nativeEvent: {
        contentOffset: { x: 0, y },
        contentSize: { width: 0, height: ch },
        layoutMeasurement: { width: 0, height: lh },
      },
    } as NativeSyntheticEvent<NativeScrollEvent>);
  }, []);

  useAnimatedReaction(
    () => {
      'worklet';
      if (hasJsScrollSV.get() !== 1) return -1;
      const sy = metricScrollY.get();
      const maxY = metricMaxScrollY.get();
      const atEdge = sy <= 1 || (maxY > 0 && sy >= maxY - 1);
      return (Math.max(0, Math.round(sy / 48)) << 1) | (atEdge ? 1 : 0);
    },
    (nextKey, prevKey) => {
      if (nextKey === -1 || nextKey === prevKey || prevKey === null) return;
      const sy = metricScrollY.get();
      if (prevKey === -1 && sy <= 0) return;
      scheduleOnRN(
        forwardJsScroll,
        sy,
        metricContentHeight.get(),
        metricLayoutHeight.get(),
      );
    },
    [
      forwardJsScroll,
      hasJsScrollSV,
      metricContentHeight,
      metricLayoutHeight,
      metricMaxScrollY,
      metricScrollY,
    ],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      bindOnLayout(event);
      onLayout?.(event);
    },
    [bindOnLayout, onLayout],
  );

  const handleContentSizeChange = useCallback(
    (width: number, height: number) => {
      bindOnContentSizeChange(width, height);
      onContentSizeChange?.(width, height);
    },
    [bindOnContentSizeChange, onContentSizeChange],
  );

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onScroll?.(event);
      onScrollEndDrag?.(event);
    },
    [onScroll, onScrollEndDrag],
  );

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onScroll?.(event);
      onMomentumScrollEnd?.(event);
    },
    [onMomentumScrollEnd, onScroll],
  );

  return (
    <InterceptingGestureDetector gesture={nativeGesture}>
      <Animated.ScrollView
        ref={ref}
        overScrollMode={pullBind.overScrollMode}
        bounces={pullBind.bounces}
        {...rest}
        scrollEventThrottle={5}
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
        onScrollEndDrag={onScroll || onScrollEndDrag ? handleScrollEndDrag : undefined}
        onMomentumScrollEnd={
          onScroll || onMomentumScrollEnd ? handleMomentumScrollEnd : undefined
        }
        onScroll={pullBind.scrollHandler as unknown as ScrollViewProps['onScroll']}
      />
    </InterceptingGestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  contentWrap: {
    flex: 1,
  },
  indicatorHost: {
    position: 'absolute',
    top: SPACING.xs,
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: 'center',
  },
  glassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.xs + 3,
    borderRadius: 999,
    backgroundColor: 'rgba(10, 24, 52, 0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(125, 211, 252, 0.34)',
  },
  pillText: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.micro,
  },
  pillTextActive: {
    color: COLORS.text.primary,
  },
});
