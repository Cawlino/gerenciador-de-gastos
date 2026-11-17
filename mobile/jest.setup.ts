/// <reference types="jest" />

import * as mockReact from 'react';
import { ScrollView as MockScrollView, Text as MockText, View as MockView } from 'react-native';

type MockUpdater<T> = (current: T) => T;

jest.mock('react-native-worklets', () => ({
  RuntimeKind: { RN: 1, UI: 2 },
  createSerializable: (v: unknown) => v,
  makeShareableCloneOnUIRecursive: (v: unknown) => v,
  runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}));

jest.mock('react-native-reanimated', () => {
  const AnimatedView = ({ children, ...props }: { children?: mockReact.ReactNode }) =>
    mockReact.createElement(MockView, props, children);

  const createAnimatedComponent = <P extends object>(Component: mockReact.ComponentType<P>) =>
    Component;

  const useSharedValue = <T,>(initial: T) => {
    const holder = {
      value: initial,
      get: () => holder.value,
      set: (next: T | MockUpdater<T>) => {
        holder.value =
          typeof next === 'function' ? (next as MockUpdater<T>)(holder.value) : next;
      },
    };
    return holder;
  };

  const api = {
    View: AnimatedView,
    Text: MockText,
    ScrollView: MockScrollView,
    createAnimatedComponent,
    useSharedValue,
    useAnimatedStyle: (updater: () => Record<string, unknown>) => updater(),
    useReducedMotion: jest.fn(() => false),
    cancelAnimation: jest.fn(),
    Easing: {
      inOut: jest.fn(() => jest.fn()),
      sin: jest.fn(),
      ease: jest.fn(),
    },
    withRepeat: jest.fn((val: unknown) => val),
    withSequence: jest.fn((...vals: unknown[]) => vals[0]),
    withTiming: jest.fn((val: unknown, _cfg?: unknown, cb?: (finished?: boolean) => void) => {
      cb?.(true);
      return val;
    }),
    withSpring: jest.fn((val: unknown, _cfg?: unknown, cb?: (finished?: boolean) => void) => {
      cb?.(true);
      return val;
    }),
    withDelay: jest.fn((_ms: number, val: unknown) => val),
  };

  return {
    __esModule: true,
    ...api,
    default: api,
  };
});

jest.mock('@shopify/react-native-skia', () => {
  const MockComponent = ({ children, ...props }: { children?: mockReact.ReactNode }) =>
    mockReact.createElement(MockView, props, children);

  return {
    Canvas: MockComponent,
    Group: MockComponent,
    BackdropFilter: MockComponent,
    Blur: MockComponent,
    RuntimeShader: MockComponent,
    Rect: MockComponent,
    RoundedRect: MockComponent,
    Path: MockComponent,
    Circle: MockComponent,
    BlurMask: MockComponent,
    LinearGradient: MockComponent,
    rect: jest.fn((x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h })),
    rrect: jest.fn((r: object, rx: number, ry: number) => ({ r, rx, ry })),
    vec: jest.fn((x: number, y: number) => ({ x, y })),
    Skia: {
      RuntimeEffect: {
        Make: jest.fn(() => ({ id: 'mock-sksl-effect' })),
      },
    },
  };
});

jest.mock('expo-blur', () => ({
  BlurView: ({ children, ...props }: { children?: mockReact.ReactNode }) =>
    mockReact.createElement(MockView, props, children),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, ...props }: { children?: mockReact.ReactNode }) =>
    mockReact.createElement(MockView, props, children),
}));

jest.mock('react-native-liquid-glassmorphism', () => ({
  LiquidGlassView: ({ children, ...props }: { children?: mockReact.ReactNode }) =>
    mockReact.createElement(MockView, props, children),
  LiquidGlassContainer: ({ children, ...props }: { children?: mockReact.ReactNode }) =>
    mockReact.createElement(MockView, props, children),
  ScrollEdgeBlurView: ({ children, ...props }: { children?: mockReact.ReactNode }) =>
    mockReact.createElement(MockView, props, children),
  isLiquidGlassSupported: jest.fn(() => true),
  getGlassCapabilities: jest.fn(() => ({
    supported: true,
    tier: 'glass',
    osVersion: 35,
    supportsNativeGlass: true,
    supportsBlur: true,
    supportsRefraction: true,
    supportsShapes: true,
  })),
  useGlassSupport: jest.fn(() => ({
    supported: true,
    tier: 'glass',
    osVersion: 35,
    supportsNativeGlass: true,
    supportsBlur: true,
    supportsRefraction: true,
    supportsShapes: true,
  })),
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('react-native-pluggy-connect', () => ({
  PluggyConnect: (props: Record<string, unknown>) =>
    mockReact.createElement(MockView, { testID: 'pluggy-connect-mock', ...props }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...props }: { children?: mockReact.ReactNode }) =>
    mockReact.createElement(MockView, props, children),
  SafeAreaProvider: ({ children }: { children?: mockReact.ReactNode }) =>
    mockReact.createElement(mockReact.Fragment, null, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => fn(...args),
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  createWorkletRuntime: () => ({}),
  scheduleOnUI: (fn: () => void) => fn(),
}));

jest.mock('react-native-gesture-handler', () => {
  const { ScrollView: RNScrollView } = jest.requireActual('react-native');
  let nextTag = 10;
  const createMockGesture = () => ({
    handlerTag: nextTag++,
    type: 0,
    config: {},
    detectorCallbacks: {},
    gestureRelations: { simultaneousHandlers: [], waitFor: [], blocksHandlers: [] },
  });
  const createChainable = () => {
    const chain: Record<string, unknown> = { handlerTag: nextTag++ };
    const noop = () => chain;
    for (const key of [
      'onBegin',
      'onStart',
      'onActivate',
      'onUpdate',
      'onEnd',
      'onFinalize',
      'activeOffsetX',
      'activeOffsetY',
      'failOffsetX',
      'failOffsetY',
      'activateAfterLongPress',
      'minDistance',
      'enabled',
      'blocksExternalGesture',
      'simultaneousWithExternalGesture',
    ]) {
      chain[key] = noop;
    }
    return chain;
  };
  return {
    GestureHandlerRootView: ({ children, ...props }: { children?: mockReact.ReactNode }) =>
      mockReact.createElement(MockView, props, children),
    GestureDetector: ({ children }: { children?: mockReact.ReactNode }) =>
      mockReact.createElement(mockReact.Fragment, null, children),
    InterceptingGestureDetector: ({ children }: { children?: mockReact.ReactNode }) =>
      mockReact.createElement(mockReact.Fragment, null, children),
    ScrollView: RNScrollView,
    usePanGesture: () => createMockGesture(),
    useTapGesture: () => createMockGesture(),
    useLongPressGesture: () => createMockGesture(),
    useNativeGesture: () => createMockGesture(),
    useCompetingGestures: (...gestures: unknown[]) => ({
      handlerTags: [nextTag++],
      config: {},
      gestures,
      detectorCallbacks: {},
    }),
    useSimultaneousGestures: (...gestures: unknown[]) => ({
      handlerTags: [nextTag++],
      config: {},
      gestures,
      detectorCallbacks: {},
    }),
    Gesture: {
      Pan: createChainable,
      Tap: createChainable,
      LongPress: createChainable,
      Native: createChainable,
      Race: createChainable,
      Simultaneous: createChainable,
    },
  };
});

{
  const skiaMock = jest.requireMock('@shopify/react-native-skia') as Record<string, unknown>;
  const MockSkiaNode = ({ children, ...props }: { children?: mockReact.ReactNode }) =>
    mockReact.createElement(MockView, props, children);
  skiaMock.Shader = skiaMock.Shader ?? MockSkiaNode;
  skiaMock.Fill = skiaMock.Fill ?? MockSkiaNode;

  const reanimatedMock = jest.requireMock('react-native-reanimated') as Record<string, unknown>;
  reanimatedMock.useSharedValue = (init: unknown) => {
    const sv = {
      value: init,
      get() {
        return sv.value;
      },
      set(next: unknown) {
        sv.value =
          typeof next === 'function' ? (next as (prev: unknown) => unknown)(sv.value) : next;
      },
    };
    return sv;
  };
  reanimatedMock.Extrapolation = reanimatedMock.Extrapolation ?? {
    CLAMP: 'clamp',
    EXTEND: 'extend',
    IDENTITY: 'identity',
  };
  reanimatedMock.interpolate =
    reanimatedMock.interpolate ??
    ((value: number, input: number[], output: number[]) => {
      if (!input?.length || !output?.length) return value;
      return output[0];
    });
  reanimatedMock.clamp =
    reanimatedMock.clamp ??
    ((value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper));
  reanimatedMock.useDerivedValue =
    reanimatedMock.useDerivedValue ??
    ((updater: () => unknown) => {
      const derived = {
        value: updater(),
        get() {
          return updater();
        },
      };
      return derived;
    });
  reanimatedMock.useAnimatedScrollHandler =
    reanimatedMock.useAnimatedScrollHandler ??
    ((
      handlers:
        | ((e: unknown, ctx?: Record<string, unknown>) => void)
        | Record<string, (e: unknown, ctx?: Record<string, unknown>) => void>,
    ) => {
      const ctx: Record<string, unknown> = {};
      return (event: unknown) => {
        const payload =
          event && typeof event === 'object' && 'nativeEvent' in event
            ? (event as { nativeEvent: unknown }).nativeEvent
            : event;
        if (typeof handlers === 'function') {
          handlers(payload, ctx);
        } else {
          handlers?.onScroll?.(payload, ctx);
        }
      };
    });
  reanimatedMock.useAnimatedReaction = reanimatedMock.useAnimatedReaction ?? (() => undefined);
  reanimatedMock.useFrameCallback =
    reanimatedMock.useFrameCallback ??
    (() => ({
      setActive: () => undefined,
      isActive: false,
      callbackId: -1,
    }));
  const existingEasing = (reanimatedMock.Easing as Record<string, unknown> | undefined) ?? {};
  reanimatedMock.Easing = {
    ...existingEasing,
    linear:
      typeof existingEasing.linear === 'function' ? existingEasing.linear : (t: number) => t,
    quad: typeof existingEasing.quad === 'function' ? existingEasing.quad : (t: number) => t * t,
    cubic:
      typeof existingEasing.cubic === 'function' ? existingEasing.cubic : (t: number) => t * t * t,
    out:
      typeof existingEasing.out === 'function'
        ? existingEasing.out
        : (fn: (t: number) => number) => fn,
    inOut:
      typeof existingEasing.inOut === 'function'
        ? existingEasing.inOut
        : (fn: (t: number) => number) => fn,
    bezier:
      typeof existingEasing.bezier === 'function'
        ? existingEasing.bezier
        : () => (t: number) => t,
  };
}
