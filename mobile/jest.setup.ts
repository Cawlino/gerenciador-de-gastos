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
    withTiming: jest.fn((val: unknown) => val),
    withSpring: jest.fn((val: unknown) => val),
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
