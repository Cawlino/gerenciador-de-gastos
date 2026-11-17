import {
  TabRouter,
  createStandardRouterNavigator,
  type NavigatorContentProps,
  type TabNavigationState,
  type TabRouterOptions,
} from 'expo-router';
import { ArrowLeftRight, LayoutDashboard, Link2 } from 'lucide-react-native';
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { type LayoutChangeEvent, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  clamp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { GlassBackground } from '../../src/components/GlassBackground';
import { GlassTabBar, type GlassTabDescriptor } from '../../src/components/GlassTabBar';
import { MotionProvider, TabSlotProvider } from '../../src/theme/MotionContext';
import { COLORS } from '../../src/theme/tokens';

const TAB_ORDER = ['index', 'transactions', 'settings'] as const;
function applyRubberBandTab(raw: number, maxIdx: number): number {
  'worklet';
  if (raw < 0) return raw * 0.22;
  if (raw > maxIdx) return maxIdx + (raw - maxIdx) * 0.22;
  return raw;
}

const PAGER_SNAP_SPRING = {
  damping: 26,
  stiffness: 255,
  mass: 0.86,
  energyThreshold: 2e-5,
} as const;
const TAB_PRESS_SPRING = {
  damping: 28,
  stiffness: 185,
  mass: 0.9,
  energyThreshold: 2e-5,
} as const;

interface LiquidTabOptions {
  title?: string;
  tabBarLabel?: string;
  tabBarButtonTestID?: string;
  tabBarAccessibilityLabel?: string;
  tabBarIcon?: (props: { focused: boolean; color: string; size: number }) => ReactNode;
  lazy?: boolean;
}

type LiquidTabEventMap = {
  tabPress: { data: undefined; canPreventDefault: true };
};

type LiquidTabCreateProps = {
  preload: (name: string) => void;
};

type LiquidTabsContentProps = NavigatorContentProps<
  LiquidTabOptions,
  LiquidTabEventMap,
  object,
  LiquidTabCreateProps
>;

function LiquidTabsContent({
  state,
  descriptors,
  actions,
  emitter,
  preload,
}: LiquidTabsContentProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { width: rawWidth, height: rawHeight } = useWindowDimensions();
  const pageWidth = rawWidth > 0 ? rawWidth : 390;
  const pageHeight = rawHeight > 0 ? rawHeight : 840;

  const routes = state.routes;
  const maxIndex = Math.max(routes.length - 1, 0);

  const pageWidthSV = useSharedValue(pageWidth);
  const maxIndexSV = useSharedValue(maxIndex);
  const scrollY = useSharedValue(0);
  const tabProgress = useSharedValue(state.index);
  const isTabDragging = useSharedValue(0);
  const dragStartTab = useSharedValue(state.index);
  const committedTabSV = useSharedValue(state.index);
  const dragAnchorTabSV = useSharedValue(state.index);
  const touchStartAbsX = useSharedValue(0);
  const touchStartAbsY = useSharedValue(0);
  const panHandledSV = useSharedValue(0);
  const lastPanTranslationX = useSharedValue(0);
  const lastPanVelocityX = useSharedValue(0);
  const pullOffset = useSharedValue(0);
  const viewportHeight = useSharedValue(pageHeight);

  const gestureTargetRef = useRef<number | null>(null);
  const preloadedNamesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    pageWidthSV.set(pageWidth);
    maxIndexSV.set(maxIndex);
    viewportHeight.set(pageHeight);
  }, [maxIndex, maxIndexSV, pageHeight, pageWidth, pageWidthSV, viewportHeight]);

  // Garante montagem imediata das 3 abas via dispatch do próprio TabRouter (sem loop)
  useEffect(() => {
    for (const route of routes) {
      const desc = descriptors[route.key] as { route?: { key?: string } } | undefined;
      if (desc?.route?.key === undefined && !preloadedNamesRef.current.has(route.name)) {
        preloadedNamesRef.current.add(route.name);
        preload(route.name);
      }
    }
  }, [descriptors, preload, routes]);

  const markGestureCommit = useCallback((index: number) => {
    gestureTargetRef.current = index;
  }, []);

  const animateToTabIndex = useCallback(
    (targetIdx: number) => {
      committedTabSV.set(targetIdx);
      if (reducedMotion) {
        tabProgress.set(targetIdx);
      } else {
        tabProgress.set(withSpring(targetIdx, TAB_PRESS_SPRING));
      }
    },
    [committedTabSV, reducedMotion, tabProgress],
  );

  const navigateToIndex = useCallback(
    (nextIndex: number) => {
      const targetRoute = routes[nextIndex];
      if (!targetRoute || nextIndex === state.index) return;
      gestureTargetRef.current = nextIndex;
      const event = emitter.emit({
        type: 'tabPress',
        target: targetRoute.key,
        canPreventDefault: true,
      });
      if (!event.defaultPrevented) {
        actions.navigate(targetRoute.name);
      }
    },
    [actions, emitter, routes, state.index],
  );

  const navigateToTab = useCallback(
    (routeKey: string) => {
      const targetIdx = routes.findIndex((r) => r.key === routeKey);
      const targetRoute = targetIdx >= 0 ? routes[targetIdx] : undefined;
      if (!targetRoute) return;
      const event = emitter.emit({
        type: 'tabPress',
        target: targetRoute.key,
        canPreventDefault: true,
      });
      if (!event.defaultPrevented) {
        if (gestureTargetRef.current !== targetIdx) {
          gestureTargetRef.current = targetIdx;
          animateToTabIndex(targetIdx);
        }
        actions.navigate(targetRoute.name);
      }
    },
    [actions, animateToTabIndex, emitter, routes],
  );

  // Anima deslize horizontal ao navegar externamente via rota sem matar animações em curso
  useEffect(() => {
    committedTabSV.set(state.index);
    if (isTabDragging.get() === 1) {
      return;
    }
    if (gestureTargetRef.current === state.index) {
      gestureTargetRef.current = null;
      return;
    }
    gestureTargetRef.current = null;
    animateToTabIndex(state.index);
  }, [animateToTabIndex, committedTabSV, isTabDragging, state.index]);

  const finishPagerGesture = useCallback(
    (translationX: number, velocityX: number) => {
      'worklet';
      if (panHandledSV.get() === 1 || isTabDragging.get() === 0) return;
      panHandledSV.set(1);
      isTabDragging.set(0);

      const pw = Math.max(pageWidthSV.get(), 1);
      const maxIdx = maxIndexSV.get();
      const startTab = dragStartTab.get();
      const raw = startTab - translationX / pw;
      const panDelta = -translationX / pw;
      const anchorIdx = clamp(dragAnchorTabSV.get(), 0, maxIdx);
      const deltaFromAnchor = raw - anchorIdx;

      let target = anchorIdx;
      if (Math.abs(deltaFromAnchor) >= 0.45) {
        target = Math.round(clamp(raw, 0, maxIdx));
      } else if (
        panDelta >= 0.08 ||
        deltaFromAnchor >= 0.12 ||
        velocityX < -180
      ) {
        target =
          velocityX > 360 && panDelta < 0.25
            ? anchorIdx
            : Math.min(maxIdx, anchorIdx + 1);
      } else if (
        panDelta <= -0.08 ||
        deltaFromAnchor <= -0.12 ||
        velocityX > 180
      ) {
        target =
          velocityX < -360 && panDelta > -0.25
            ? anchorIdx
            : Math.max(0, anchorIdx - 1);
      }

      committedTabSV.set(target);
      scheduleOnRN(navigateToIndex, target);

      if (reducedMotion) {
        tabProgress.set(target);
      } else {
        tabProgress.set(
          withSpring(target, {
            ...PAGER_SNAP_SPRING,
            velocity: clamp(-velocityX / pw, -9, 9),
          }),
        );
      }
    },
    [
      committedTabSV,
      dragAnchorTabSV,
      dragStartTab,
      isTabDragging,
      maxIndexSV,
      navigateToIndex,
      pageWidthSV,
      panHandledSV,
      reducedMotion,
      tabProgress,
    ],
  );

  const initDragAnchor = useCallback(() => {
    'worklet';
    cancelAnimation(tabProgress);
    isTabDragging.set(1);
    const currentPos = tabProgress.get();
    dragStartTab.set(currentPos);
    const committed = committedTabSV.get();
    dragAnchorTabSV.set(
      Math.abs(currentPos - committed) < 0.65
        ? committed
        : Math.round(clamp(currentPos, 0, maxIndexSV.get())),
    );
    return currentPos;
  }, [committedTabSV, dragAnchorTabSV, dragStartTab, isTabDragging, maxIndexSV, tabProgress]);

  const pagerPan = usePanGesture({
    activeOffsetX: [-7, 7],
    failOffsetY: [-15, 15],
    enabled: maxIndex > 0,
    onBegin: (event) => {
      'worklet';
      panHandledSV.set(0);
      touchStartAbsX.set(event.absoluteX);
      touchStartAbsY.set(event.absoluteY);
      lastPanTranslationX.set(0);
      lastPanVelocityX.set(0);
    },
    onActivate: (event) => {
      'worklet';
      const currentPos = initDragAnchor();
      const totalDx = event.absoluteX - touchStartAbsX.get();
      lastPanTranslationX.set(totalDx);
      lastPanVelocityX.set(event.velocityX);
      const pw = Math.max(pageWidthSV.get(), 1);
      tabProgress.set(applyRubberBandTab(currentPos - totalDx / pw, maxIndexSV.get()));
    },
    onUpdate: (event) => {
      'worklet';
      if (isTabDragging.get() === 0) return;
      const totalDx = event.absoluteX - touchStartAbsX.get();
      lastPanTranslationX.set(totalDx);
      lastPanVelocityX.set(event.velocityX);
      const pw = Math.max(pageWidthSV.get(), 1);
      tabProgress.set(applyRubberBandTab(dragStartTab.get() - totalDx / pw, maxIndexSV.get()));
    },
    onDeactivate: (event) => {
      'worklet';
      const totalDx = event.absoluteX - touchStartAbsX.get();
      const lastTx = lastPanTranslationX.get();
      const lastVx = lastPanVelocityX.get();
      const tx = Math.abs(totalDx) >= Math.abs(lastTx) ? totalDx : lastTx;
      const vx = Math.abs(event.velocityX) >= Math.abs(lastVx) ? event.velocityX : lastVx;
      finishPagerGesture(tx, vx);
    },
    onFinalize: (event) => {
      'worklet';
      if (panHandledSV.get() === 1) return;
      const totalDx = event.absoluteX - touchStartAbsX.get();
      const totalDy = event.absoluteY - touchStartAbsY.get();
      if (isTabDragging.get() === 1) {
        const lastTx = lastPanTranslationX.get();
        const tx = Math.abs(totalDx) >= Math.abs(lastTx) ? totalDx : lastTx;
        finishPagerGesture(tx, lastPanVelocityX.get());
        return;
      }
      if (!event.canceled && Math.abs(totalDx) >= 28 && Math.abs(totalDx) > Math.abs(totalDy) * 1.6) {
        initDragAnchor();
        finishPagerGesture(totalDx, lastPanVelocityX.get());
      }
    },
  });

  const stripAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -tabProgress.get() * pageWidthSV.get() }],
  }));

  const mappedDescriptors = useMemo(() => {
    const next: Record<string, GlassTabDescriptor | undefined> = {};
    for (const route of routes) {
      const desc = descriptors[route.key];
      if (desc) {
        next[route.key] = {
          options: desc.options as GlassTabDescriptor['options'],
        };
      }
    }
    return next;
  }, [descriptors, routes]);

  const handleRootLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      if (h > 0) viewportHeight.set(h);
    },
    [viewportHeight],
  );

  return (
    <MotionProvider
      scrollY={scrollY}
      tabProgress={tabProgress}
      isTabDragging={isTabDragging}
      pullOffset={pullOffset}
      viewportHeight={viewportHeight}
      hasSharedBackground
      pagerGesture={pagerPan}
      markGestureCommit={markGestureCommit}
    >
      <View style={styles.root} onLayout={handleRootLayout}>
        <GlassBackground ignoreSharedBackground style={StyleSheet.absoluteFill} />

        <GestureDetector gesture={pagerPan}>
          <View style={styles.viewport}>
            <Animated.View
              style={[
                styles.strip,
                { width: pageWidth * Math.max(routes.length, 1) },
                stripAnimatedStyle,
              ]}
            >
              {routes.map((route, idx) => (
                <View key={route.name} style={{ width: pageWidth, flex: 1 }}>
                  <TabSlotProvider index={idx}>
                    {descriptors[route.key]?.render() ?? null}
                  </TabSlotProvider>
                </View>
              ))}
            </Animated.View>
          </View>
        </GestureDetector>

        <GlassTabBar
          state={state}
          descriptors={mappedDescriptors}
          navigateToTab={navigateToTab}
          insets={insets}
        />
      </View>
    </MotionProvider>
  );
}

type LiquidTabState = TabNavigationState<Record<string, object | undefined>>;

const LiquidTabs = createStandardRouterNavigator<
  LiquidTabOptions,
  LiquidTabState,
  LiquidTabEventMap,
  object,
  TabRouterOptions,
  LiquidTabCreateProps
>(LiquidTabsContent, TabRouter, {
  activityDefaultThreshold: 99,
  createProps: ({ dispatch }) => ({
    preload: (name: string) =>
      dispatch({
        type: 'PRELOAD',
        payload: { name },
      }),
  }),
  processDescriptors: (descriptors, state, describe) => {
    const missingNames = state.routeNames.filter(
      (name) => !state.routes.some((route) => route.name === name),
    );
    if (missingNames.length === 0) {
      return descriptors;
    }
    const nextDescriptors = { ...descriptors };
    for (const name of missingNames) {
      nextDescriptors[name] = describe({ key: undefined, name } as never);
    }
    return nextDescriptors;
  },
  processState: (state, descriptors) => {
    const orderedNames = [
      ...TAB_ORDER.filter((name) => state.routeNames.includes(name)),
      ...state.routeNames.filter(
        (name) => !(TAB_ORDER as readonly string[]).includes(name),
      ),
    ];
    const nextRoutes = orderedNames.map((name) => {
      const existing = state.routes.find((route) => route.name === name);
      if (existing) {
        return existing;
      }
      const placeholderDesc = descriptors[name];
      if (!placeholderDesc) {
        return { key: name, name };
      }
      return {
        ...placeholderDesc.route,
        key: name,
        name,
      };
    });

    const isSameOrder =
      nextRoutes.length === state.routes.length &&
      nextRoutes.every((route, idx) => route === state.routes[idx]);
    if (isSameOrder) {
      return state;
    }

    const focusedKey = state.routes[state.index]?.key;
    const nextIndex = Math.max(
      0,
      nextRoutes.findIndex((route) => route.key === focusedKey),
    );
    return {
      ...state,
      index: nextIndex,
      routes: nextRoutes,
    };
  },
});

const INDEX_OPTIONS: LiquidTabOptions = {
  title: 'Painel',
  lazy: false,
  tabBarIcon: ({ color, size }: { color: string; size: number }) => (
    <LayoutDashboard color={color} size={size} />
  ),
};

const TRANSACTIONS_OPTIONS: LiquidTabOptions = {
  title: 'Transações',
  lazy: false,
  tabBarIcon: ({ color, size }: { color: string; size: number }) => (
    <ArrowLeftRight color={color} size={size} />
  ),
};

const SETTINGS_OPTIONS: LiquidTabOptions = {
  title: 'Conexão',
  lazy: false,
  tabBarIcon: ({ color, size }: { color: string; size: number }) => (
    <Link2 color={color} size={size} />
  ),
};

export default function TabsLayout() {
  return (
    <LiquidTabs>
      <LiquidTabs.Screen name="index" options={INDEX_OPTIONS} />
      <LiquidTabs.Screen name="transactions" options={TRANSACTIONS_OPTIONS} />
      <LiquidTabs.Screen name="settings" options={SETTINGS_OPTIONS} />
    </LiquidTabs>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg.pureBlack,
  },
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  strip: {
    flex: 1,
    flexDirection: 'row',
  },
});
