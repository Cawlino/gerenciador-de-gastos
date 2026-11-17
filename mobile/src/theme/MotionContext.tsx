import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import type { PanGesture } from 'react-native-gesture-handler';
import type { DerivedValue, FrameInfo, SharedValue } from 'react-native-reanimated';
import {
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const AURA_SCROLL_RETURN_SPRING = {
  damping: 18,
  stiffness: 140,
  mass: 0.9,
  energyThreshold: 5e-5,
} as const;

const AURA_TAB_RELEASE_SPRING = {
  damping: 16,
  stiffness: 125,
  mass: 0.95,
  energyThreshold: 5e-5,
} as const;

export interface WanderingAuraCoords {
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
}

export interface ScrollOffsetScopeValue {
  scrollY: SharedValue<number>;
  pullOffset: SharedValue<number>;
}

export interface MotionContextValue {
  /** Posição vertical do scroll na tela ativa (em px). */
  scrollY: SharedValue<number>;
  /** Scroll vertical independente de cada aba (0 = Painel, 1 = Transações, 2 = Conexão). */
  tabScrollY?: readonly [SharedValue<number>, SharedValue<number>, SharedValue<number>];
  /** Progresso horizontal contínuo entre abas (0 = Painel, 1 = Transações, 2 = Conexão). */
  tabProgress: SharedValue<number>;
  /** Flag 1 enquanto o usuário segura/arrasta a bolinha ou o pager horizontal. */
  isTabDragging: SharedValue<number>;
  /** Deslocamento elástico do pull-to-refresh (em px >= 0). */
  pullOffset: SharedValue<number>;
  /** Offset elástico de pull/overscroll independente de cada aba. */
  tabPullOffset?: readonly [SharedValue<number>, SharedValue<number>, SharedValue<number>];
  /** Desvio elástico horizontal/vertical da aura azul ao cruzar cards e abas (em dp). */
  auraDeflectX: SharedValue<number>;
  auraDeflectY: SharedValue<number>;
  auraHorizX: SharedValue<number>;
  /** Altura útil da viewport de abas (em dp). */
  viewportHeight: SharedValue<number>;
  /** Coordenadas das duas auras calculadas uma única vez por frame na UI Thread. */
  auraCoords: DerivedValue<WanderingAuraCoords>;
  /** Indica que um GlassBackground compartilhado já envolve o container de abas. */
  hasSharedBackground: boolean;
  /** Referência ao gesto horizontal externo das abas para gestures filhos bloquearem conflitos. */
  pagerGesture?: PanGesture;
  /** Evita reiniciar animação quando gesture/pill já animou até targetIndex. */
  markGestureCommit?: (index: number) => void;
  /** Atualiza scrollY sem re-renders React. */
  reportScroll: (offsetY: number) => void;
}

const MotionContext = createContext<MotionContextValue | null>(null);

interface MotionProviderProps {
  children: React.ReactNode;
  scrollY?: SharedValue<number>;
  tabProgress?: SharedValue<number>;
  isTabDragging?: SharedValue<number>;
  pullOffset?: SharedValue<number>;
  viewportHeight?: SharedValue<number>;
  hasSharedBackground?: boolean;
  pagerGesture?: PanGesture;
  markGestureCommit?: (index: number) => void;
}

export function MotionProvider({
  children,
  scrollY: externalScrollY,
  tabProgress: externalTabProgress,
  isTabDragging: externalIsTabDragging,
  pullOffset: externalPullOffset,
  viewportHeight: externalViewportHeight,
  hasSharedBackground = false,
  pagerGesture,
  markGestureCommit,
}: MotionProviderProps) {
  const internalScrollY = useSharedValue(0);
  const internalTabProgress = useSharedValue(0);
  const internalIsTabDragging = useSharedValue(0);
  const internalPullOffset = useSharedValue(0);
  const internalAuraDeflectX = useSharedValue(0);
  const internalAuraDeflectY = useSharedValue(0);
  const internalAuraHorizX = useSharedValue(0);
  const internalViewportHeight = useSharedValue(840);
  const tabScrollY1 = useSharedValue(0);
  const tabScrollY2 = useSharedValue(0);
  const tabPull1 = useSharedValue(0);
  const tabPull2 = useSharedValue(0);

  const scrollY = externalScrollY ?? internalScrollY;
  const tabProgress = externalTabProgress ?? internalTabProgress;
  const isTabDragging = externalIsTabDragging ?? internalIsTabDragging;
  const pullOffset = externalPullOffset ?? internalPullOffset;
  const auraDeflectX = internalAuraDeflectX;
  const auraDeflectY = internalAuraDeflectY;
  const auraHorizX = internalAuraHorizX;
  const viewportHeight = externalViewportHeight ?? internalViewportHeight;

  const tabScrollY = useMemo(
    () => [scrollY, tabScrollY1, tabScrollY2] as const,
    [scrollY, tabScrollY1, tabScrollY2],
  );
  const tabPullOffset = useMemo(
    () => [pullOffset, tabPull1, tabPull2] as const,
    [pullOffset, tabPull1, tabPull2],
  );

  const effectiveScrollY = useDerivedValue<number>(() => {
    if (!hasSharedBackground) {
      return scrollY.get();
    }
    const t = Math.max(0, Math.min(2, tabProgress.get()));
    const s0 = scrollY.get();
    const s1 = tabScrollY1.get();
    if (t <= 1) {
      return s0 + (s1 - s0) * t;
    }
    const s2 = tabScrollY2.get();
    return s1 + (s2 - s1) * (t - 1);
  });

  const effectivePullOffset = useDerivedValue<number>(() => {
    if (!hasSharedBackground) {
      return pullOffset.get();
    }
    const t = Math.max(0, Math.min(2, tabProgress.get()));
    const p0 = pullOffset.get();
    const p1 = tabPull1.get();
    if (t <= 1) {
      return p0 + (p1 - p0) * t;
    }
    const p2 = tabPull2.get();
    return p1 + (p2 - p1) * (t - 1);
  });

  const { width: rawVpW } = useWindowDimensions();
  const vpW = rawVpW > 0 ? rawVpW : 390;
  const reducedMotion = useReducedMotion();

  const scrollGoalX = useSharedValue(0);
  const scrollGoalY = useSharedValue(0);
  const tabGoalHX = useSharedValue(0);
  const tabGoalY = useSharedValue(0);
  const deflectVelX = useSharedValue(0);
  const deflectVelY = useSharedValue(0);
  const deflectVelHX = useSharedValue(0);
  const framesSinceScrollSV = useSharedValue(10);
  const framesSinceTabSV = useSharedValue(10);
  const activeYSpring = useSharedValue(0);
  const isDeflectActiveSV = useSharedValue(0);

  const scrollDeflectSetActiveRef = useRef<((active: boolean) => void) | null>(null);

  const setScrollDeflectRunning = useCallback((active: boolean) => {
    scrollDeflectSetActiveRef.current?.(active);
  }, []);

  const stepScrollDeflect = useCallback(
    (frameInfo: FrameInfo) => {
      'worklet';
      const dt = Math.min(
        0.032,
        Math.max(0.002, (frameInfo.timeSincePreviousFrame ?? 8.33) / 1000),
      );
      let x = internalAuraDeflectX.get();
      let y = internalAuraDeflectY.get();
      let hx = internalAuraHorizX.get();
      let vx = deflectVelX.get();
      let vy = deflectVelY.get();
      let vhx = deflectVelHX.get();
      const draggingTab = isTabDragging.get() === 1;

      const sFrames = framesSinceScrollSV.get() + 1;
      framesSinceScrollSV.set(sFrames);
      const tFrames = framesSinceTabSV.get() + 1;
      framesSinceTabSV.set(tFrames);

      if (sFrames <= 2) {
        const nextX = x + (scrollGoalX.get() - x) * 0.22;
        vx = (nextX - x) * 34;
        x = nextX;
      } else {
        const invMass = 1 / AURA_SCROLL_RETURN_SPRING.mass;
        vx +=
          (-AURA_SCROLL_RETURN_SPRING.stiffness * x - AURA_SCROLL_RETURN_SPRING.damping * vx) *
          invMass *
          dt;
        x += vx * dt;
      }

      if (tFrames <= 2) {
        const nextHX = hx + (tabGoalHX.get() - hx) * 0.24;
        vhx = (nextHX - hx) * 36;
        hx = nextHX;
      } else {
        const invMass = 1 / AURA_TAB_RELEASE_SPRING.mass;
        vhx +=
          (-AURA_TAB_RELEASE_SPRING.stiffness * hx - AURA_TAB_RELEASE_SPRING.damping * vhx) *
          invMass *
          dt;
        hx += vhx * dt;
      }

      if (sFrames <= 2) {
        const nextY = y + (scrollGoalY.get() - y) * 0.22;
        vy = (nextY - y) * 34;
        y = nextY;
      } else if (tFrames <= 2) {
        const nextY = y + (tabGoalY.get() - y) * 0.2;
        vy = (nextY - y) * 32;
        y = nextY;
      } else {
        const useTabSpring = activeYSpring.get() === 1;
        const cfg = useTabSpring ? AURA_TAB_RELEASE_SPRING : AURA_SCROLL_RETURN_SPRING;
        const invMass = 1 / cfg.mass;
        vy += (-cfg.stiffness * y - cfg.damping * vy) * invMass * dt;
        y += vy * dt;
      }

      if (
        !draggingTab &&
        sFrames > 2 &&
        tFrames > 2 &&
        Math.abs(x) < 0.15 &&
        Math.abs(y) < 0.15 &&
        Math.abs(hx) < 0.15 &&
        Math.abs(vx) < 0.5 &&
        Math.abs(vy) < 0.5 &&
        Math.abs(vhx) < 0.5
      ) {
        internalAuraDeflectX.set(0);
        internalAuraDeflectY.set(0);
        internalAuraHorizX.set(0);
        deflectVelX.set(0);
        deflectVelY.set(0);
        deflectVelHX.set(0);
        if (isDeflectActiveSV.get() === 1) {
          isDeflectActiveSV.set(0);
          scheduleOnRN(setScrollDeflectRunning, false);
        }
        return;
      }

      deflectVelX.set(vx);
      deflectVelY.set(vy);
      deflectVelHX.set(vhx);
      internalAuraDeflectX.set(x);
      internalAuraDeflectY.set(y);
      internalAuraHorizX.set(hx);
    },
    [
      activeYSpring,
      deflectVelHX,
      deflectVelX,
      deflectVelY,
      framesSinceScrollSV,
      framesSinceTabSV,
      internalAuraDeflectX,
      internalAuraDeflectY,
      internalAuraHorizX,
      isDeflectActiveSV,
      isTabDragging,
      scrollGoalX,
      scrollGoalY,
      setScrollDeflectRunning,
      tabGoalHX,
      tabGoalY,
    ],
  );

  const scrollDeflectFrameCallback = useFrameCallback(stepScrollDeflect, false);

  useEffect(() => {
    scrollDeflectSetActiveRef.current = scrollDeflectFrameCallback.setActive;
    return () => {
      scrollDeflectSetActiveRef.current = null;
    };
  }, [scrollDeflectFrameCallback]);

  useAnimatedReaction(
    () => effectiveScrollY.get(),
    (nextY, prevY) => {
      'worklet';
      if (reducedMotion || prevY === null || isTabDragging.get() === 1) {
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

      const curX = internalAuraDeflectX.get();
      const curY = internalAuraDeflectY.get();
      const nextX = curX + (targetX - curX) * 0.28;
      const nextYVal = curY + (targetY - curY) * 0.28;

      deflectVelX.set((nextX - curX) * 36);
      deflectVelY.set((nextYVal - curY) * 36);
      internalAuraDeflectX.set(nextX);
      internalAuraDeflectY.set(nextYVal);
      scrollGoalX.set(targetX);
      scrollGoalY.set(targetY);
      activeYSpring.set(0);
      framesSinceScrollSV.set(0);
      if (isDeflectActiveSV.get() === 0) {
        isDeflectActiveSV.set(1);
        scheduleOnRN(setScrollDeflectRunning, true);
      }
    },
    [
      activeYSpring,
      deflectVelX,
      deflectVelY,
      effectiveScrollY,
      framesSinceScrollSV,
      internalAuraDeflectX,
      internalAuraDeflectY,
      isDeflectActiveSV,
      isTabDragging,
      reducedMotion,
      scrollGoalX,
      scrollGoalY,
      setScrollDeflectRunning,
    ],
  );

  useAnimatedReaction(
    () => isTabDragging.get(),
    (dragging, prevDragging) => {
      'worklet';
      if (reducedMotion || prevDragging === null) {
        return;
      }
      if (dragging === 0 && prevDragging === 1) {
        if (
          isDeflectActiveSV.get() === 0 &&
          (Math.abs(internalAuraHorizX.get()) >= 0.15 ||
            Math.abs(internalAuraDeflectY.get()) >= 0.15)
        ) {
          isDeflectActiveSV.set(1);
          scheduleOnRN(setScrollDeflectRunning, true);
        }
      }
    },
    [
      internalAuraDeflectY,
      internalAuraHorizX,
      isDeflectActiveSV,
      isTabDragging,
      reducedMotion,
      setScrollDeflectRunning,
    ],
  );

  useAnimatedReaction(
    () => tabProgress.get(),
    (nextTab, prevTab) => {
      'worklet';
      if (reducedMotion || prevTab === null) {
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
      const targetHX = dir * 56 * speedNorm;
      const waveY = Math.sin(nextTab * Math.PI);
      const targetY = 26 * waveY * speedNorm;

      const curHX = internalAuraHorizX.get();
      const curY = internalAuraDeflectY.get();
      const nextHX = curHX + (targetHX - curHX) * 0.3;
      const nextYVal = curY + (targetY - curY) * 0.24;

      deflectVelHX.set((nextHX - curHX) * 38);
      deflectVelY.set((nextYVal - curY) * 34);
      internalAuraHorizX.set(nextHX);
      internalAuraDeflectY.set(nextYVal);
      tabGoalHX.set(targetHX);
      tabGoalY.set(targetY);
      activeYSpring.set(1);
      framesSinceTabSV.set(0);
      if (isDeflectActiveSV.get() === 0) {
        isDeflectActiveSV.set(1);
        scheduleOnRN(setScrollDeflectRunning, true);
      }
    },
    [
      activeYSpring,
      deflectVelHX,
      deflectVelY,
      framesSinceTabSV,
      internalAuraDeflectY,
      internalAuraHorizX,
      isDeflectActiveSV,
      reducedMotion,
      setScrollDeflectRunning,
      tabGoalHX,
      tabGoalY,
      tabProgress,
    ],
  );

  const auraCoords = useDerivedValue<WanderingAuraCoords>(() => {
    if (reducedMotion) {
      return computeWanderingAuras(0, 0, 0, 0, 0, vpW, viewportHeight.get(), 0);
    }
    return computeWanderingAuras(
      effectiveScrollY.get(),
      tabProgress.get(),
      effectivePullOffset.get(),
      auraDeflectX.get(),
      auraDeflectY.get(),
      vpW,
      viewportHeight.get(),
      auraHorizX.get(),
    );
  });

  const reportScroll = useCallback(
    (offsetY: number) => {
      const clamped = offsetY < 0 ? 0 : offsetY;
      scrollY.set(clamped);
    },
    [scrollY],
  );

  const value = useMemo<MotionContextValue>(
    () => ({
      scrollY,
      tabScrollY,
      tabProgress,
      isTabDragging,
      pullOffset,
      tabPullOffset,
      auraDeflectX,
      auraDeflectY,
      auraHorizX,
      viewportHeight,
      auraCoords,
      hasSharedBackground,
      pagerGesture,
      markGestureCommit,
      reportScroll,
    }),
    [
      scrollY,
      tabScrollY,
      tabProgress,
      isTabDragging,
      pullOffset,
      tabPullOffset,
      auraDeflectX,
      auraDeflectY,
      auraHorizX,
      viewportHeight,
      auraCoords,
      hasSharedBackground,
      pagerGesture,
      markGestureCommit,
      reportScroll,
    ],
  );

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

/**
 * Acessa o contexto de movimento compartilhado. Retorna `null` fora do provider
 * (ex.: rotas modais ou testes isolados).
 */
export function useMotion(): MotionContextValue | null {
  return useContext(MotionContext);
}

const TabSlotContext = createContext<number>(-1);
const ScrollOffsetContext = createContext<ScrollOffsetScopeValue | null>(null);

export function ScrollOffsetProvider({
  scrollY,
  pullOffset,
  children,
}: {
  scrollY: SharedValue<number>;
  pullOffset: SharedValue<number>;
  children: React.ReactNode;
}) {
  const value = useMemo<ScrollOffsetScopeValue>(
    () => ({ scrollY, pullOffset }),
    [scrollY, pullOffset],
  );
  return <ScrollOffsetContext.Provider value={value}>{children}</ScrollOffsetContext.Provider>;
}

/**
 * Acessa o scroll vertical do container rolável mais próximo (ex.: LiquidPullRefresh da aba).
 * Retorna `null` para elementos fixos fora de containers roláveis.
 */
export function useScrollOffsetScope(): ScrollOffsetScopeValue | null {
  return useContext(ScrollOffsetContext);
}

export function TabSlotProvider({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  return <TabSlotContext.Provider value={index}>{children}</TabSlotContext.Provider>;
}

/**
 * Índice da aba à qual o componente pertence (-1 fora do pager de abas).
 * Usado por superfícies Skia para evitar redesenhos em abas fora da tela.
 */
export function useTabSlotIndex(): number {
  return useContext(TabSlotContext);
}

/**
 * Calcula em UI thread os centros (c1x, c1y) e (c2x, c2y) das duas auras azuis
 * que vagam continuamente por toda a largura/altura da tela durante o scroll vertical
 * e a transição horizontal entre abas, mantendo coerência entre fundo e bordas.
 */
export function computeWanderingAuras(
  scrollY: number,
  tabProgress: number,
  pullOffset: number,
  deflectX: number,
  deflectY: number,
  vpW: number,
  vpH: number,
  horizX = 0,
): { c1x: number; c1y: number; c2x: number; c2y: number } {
  'worklet';
  const sy = scrollY > 0 ? scrollY : 0;
  const pull = pullOffset < -96 ? -96 : pullOffset > 165 ? 165 : pullOffset;
  const safeW = vpW > 0 ? vpW : 390;
  const safeH = vpH > 0 ? vpH : 840;

  const c1x =
    safeW * (0.5 + 0.36 * Math.sin(sy / 220 + 0.85 - tabProgress * 1.15)) + deflectX + horizX;
  const c1y =
    safeH * (0.5 - 0.34 * Math.cos(sy / 260 + tabProgress * 1.15)) + deflectY + pull * 0.48;

  const c2x =
    safeW * (0.5 + 0.36 * Math.cos(sy / 240 + 0.35 + tabProgress * 1.15)) -
    deflectX * 0.72 +
    horizX * 0.88;
  const c2y =
    safeH * (0.52 + 0.32 * Math.sin(sy / 290 + 0.35 - tabProgress * 1.1)) +
    deflectY * 0.85 +
    pull * 0.32;

  return { c1x, c1y, c2x, c2y };
}

/**
 * Empacota até 6 coordenadas inteiras + versão em chave inteira de 52 bits
 * sem alocar strings ou tuplas em worklets.
 */
export function packGlassUniformKey(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  ver: number,
): number {
  'worklet';
  const h1 =
    (Math.imul((Math.imul(a | 0, 4099) + (b | 0)) | 0, 2654435761) ^
      Math.imul(ver | 0, 2246822519)) >>>
    0;
  const h2 =
    (Math.imul(
      (Math.imul((Math.imul(c | 0, 2053) + (d | 0)) | 0, 2053) + (e | 0)) | 0,
      2654435761,
    ) ^
      Math.imul(f | 0, 3266489917)) >>>
    0;
  return (h1 & 0x3ffffff) * 67108864 + (h2 & 0x3ffffff);
}
