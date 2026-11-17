/// <reference types="jest" />

import React from 'react';
import { ScrollView, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useSharedValue } from 'react-native-reanimated';
import {
  AmountText,
  DonutChart,
  GlassBackground,
  GlassCard,
  GlassTabBar,
  LiquidPullRefresh,
  MonthSwitcher,
  NeonButton,
  SkeletonCard,
  SkeletonRow,
  StatusPill,
  TransactionRow,
} from '../components';
import { computeWanderingAuras } from '../theme/MotionContext';
import PlaygroundScreen from '../../app/playground';

describe('Componentes Liquid Glass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renderiza GlassBackground com conteúdo filho', async () => {
    await render(
      <GlassBackground testID="bg">
        <Text>Conteúdo interno</Text>
      </GlassBackground>,
    );
    expect(screen.getByTestId('bg')).toBeTruthy();
    expect(screen.getByText('Conteúdo interno')).toBeTruthy();
  });

  it('ativa camada LiquidGlassView nativa e respeita forceFallback e surface="lightweight"', async () => {
    const { rerender } = await render(
      <GlassCard testID="card">
        <Text>Cartão vidro</Text>
      </GlassCard>,
    );

    expect(screen.getByTestId('card-liquid')).toBeTruthy();

    await rerender(
      <GlassCard testID="card" forceFallback>
        <Text>Cartão vidro</Text>
      </GlassCard>,
    );
    expect(screen.getByTestId('card-fallback')).toBeTruthy();

    await rerender(
      <GlassCard testID="card" surface="lightweight">
        <Text>Cartão vidro</Text>
      </GlassCard>,
    );
    expect(screen.getByTestId('card-fallback')).toBeTruthy();
  });

  it('formata AmountText com sinal e neutraliza zero negativo', async () => {
    await render(
      <>
        <AmountText value={1500} signed testID="pos" />
        <AmountText value={-49.5} signed testID="neg" />
        <AmountText value={-0} signed testID="zero" />
      </>,
    );
    expect(screen.getByTestId('pos').props.children).toBe('+ R$ 1.500,00');
    expect(screen.getByTestId('neg').props.children).toBe('- R$ 49,50');
    expect(screen.getByTestId('zero').props.children).toBe('R$ 0,00');
  });

  it('renderiza StatusPill em múltiplos estados', async () => {
    await render(
      <>
        <StatusPill label="pendente" variant="warning" />
        <StatusPill label="ignorado" variant="muted" />
        <StatusPill label="Conectado" variant="success" />
      </>,
    );
    expect(screen.getByText('pendente')).toBeTruthy();
    expect(screen.getByText('ignorado')).toBeTruthy();
    expect(screen.getByText('Conectado')).toBeTruthy();
  });

  it('dispara ação e háptico no NeonButton e bloqueia quando disabled/loading', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<NeonButton label="Sincronizar" onPress={onPress} />);

    await fireEvent.press(screen.getByText('Sincronizar'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);

    await rerender(<NeonButton label="Sincronizar" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByText('Sincronizar'));
    expect(onPress).toHaveBeenCalledTimes(1);

    await rerender(<NeonButton label="Sincronizar" onPress={onPress} loading />);
    await fireEvent.press(screen.getByText('Sincronizar'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('navega meses no MonthSwitcher respeitando limites minMonth/maxMonth', async () => {
    const onChange = jest.fn();
    await render(
      <MonthSwitcher
        month="2026-04"
        minMonth="2026-04"
        maxMonth="2026-05"
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId('month-label').props.children).toBe('Abril 2026');

    await fireEvent.press(screen.getByTestId('month-prev'));
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('month-next'));
    expect(onChange).toHaveBeenCalledWith('2026-05');
  });

  it('exibe badges pendente e ignorado no TransactionRow e trata clique', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <TransactionRow
          item={{
            id: '1',
            description: 'Supermercado Central',
            categoryName: 'Alimentação',
            amountNorm: -120.4,
            date: '2026-11-11T16:15:00-03:00',
            status: 'PENDING',
          }}
          onPress={onPress}
          testID="row-1"
        />
        <TransactionRow
          item={{
            id: '2',
            description: 'Pagamento Fatura',
            categoryName: 'Cartão',
            amountNorm: -900,
            date: '2026-11-11T12:00:00-03:00',
            effectiveExcluded: true,
          }}
          testID="row-2"
        />
      </>,
    );

    expect(screen.getByText('Supermercado Central')).toBeTruthy();
    expect(screen.getByText('Alimentação · 16:15')).toBeTruthy();
    expect(screen.getByText('pendente')).toBeTruthy();
    expect(screen.getByText('ignorado')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('row-1'));
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
  });

  it('renderiza DonutChart vazio ou com fatias interativas', async () => {
    const onSelect = jest.fn();
    const { rerender } = await render(<DonutChart slices={[]} totalExpense={0} />);
    expect(screen.getByTestId('donut-empty')).toBeTruthy();

    await rerender(
      <DonutChart
        slices={[
          { id: 'food', name: 'Alimentação', amount: 400, percent: 80 },
          { id: 'uber', name: 'Transporte', amount: 100, percent: 20 },
        ]}
        totalExpense={500}
        onSelectCategory={onSelect}
      />,
    );

    expect(screen.getByText('Alimentação')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('donut-legend-food'));
    expect(onSelect).toHaveBeenCalledWith('food');
  });

  it('renderiza SkeletonCard, SkeletonRow e GlassTabBar interativa', async () => {
    const emit = jest.fn(() => ({ defaultPrevented: false }));
    const navigateToTab = jest.fn();

    await render(
      <>
        <SkeletonCard testID="sk-card" />
        <SkeletonRow testID="sk-row" />
        <GlassTabBar
          state={{
            index: 0,
            routes: [
              { key: 'idx-1', name: 'index' },
              { key: 'tx-2', name: 'transactions' },
              { key: 'cfg-3', name: 'settings' },
            ],
          }}
          descriptors={{
            'idx-1': { options: { title: 'Painel' } },
            'tx-2': { options: { title: 'Transações' } },
            'cfg-3': { options: { title: 'Conexão' } },
          }}
          emitter={{ emit }}
          navigateToTab={navigateToTab}
          insets={{ bottom: 0 }}
        />
      </>,
    );

    expect(screen.getByTestId('sk-card')).toBeTruthy();
    expect(screen.getByTestId('sk-row')).toBeTruthy();
    expect(screen.getByTestId('tab-index').props.accessibilityState).toEqual({
      selected: true,
    });

    await fireEvent.press(screen.getByTestId('tab-transactions'));
    expect(emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'tx-2',
      canPreventDefault: true,
    });
    expect(navigateToTab).toHaveBeenCalledWith('tx-2');
  });

  it('renderiza a tela Playground e alterna modo Fallback e Skeletons', async () => {
    await render(<PlaygroundScreen />);
    expect(screen.getByTestId('playground-screen')).toBeTruthy();
    expect(screen.getByText('Playground Liquid Glass')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('toggle-fallback-btn'));
    expect(screen.getByText('Fallback Leve')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('toggle-skeleton-btn'));
    expect(screen.getByTestId('playground-skeletons')).toBeTruthy();
  });

  it('computeWanderingAuras acompanha tanto pull positivo quanto overscroll negativo', () => {
    const rest = computeWanderingAuras(0, 0, 0, 0, 0, 390, 840, 0);
    const pulledDown = computeWanderingAuras(0, 0, 60, 0, 0, 390, 840, 0);
    const bottomBounce = computeWanderingAuras(720, 0, -50, 0, 0, 390, 840, 0);
    const neutralBottom = computeWanderingAuras(720, 0, 0, 0, 0, 390, 840, 0);

    expect(pulledDown.c1y).toBeGreaterThan(rest.c1y);
    expect(bottomBounce.c1y).toBeLessThan(neutralBottom.c1y);
    expect(bottomBounce.c2y).toBeLessThan(neutralBottom.c2y);
  });

  it('LiquidPullRefresh fornece bindings de overscroll/wrapScroll e encaminha scroll sem erros', async () => {
    const onRefresh = jest.fn();
    const onUserScroll = jest.fn();

    function Host() {
      const sv = useSharedValue(0);
      return (
        <LiquidPullRefresh refreshing={false} onRefresh={onRefresh} scrollYSV={sv} testID="lpr">
          {({ overScrollMode, bounces, onLayout, onContentSizeChange, wrapScroll }) => (
            <ScrollView
              testID="lpr-scroll"
              overScrollMode={overScrollMode}
              bounces={bounces}
              onLayout={onLayout}
              onContentSizeChange={onContentSizeChange}
              onScroll={wrapScroll((e) => {
                sv.set(e.nativeEvent.contentOffset.y);
                onUserScroll(e.nativeEvent.contentOffset.y);
              })}
            >
              <Text>Conteúdo rolável</Text>
            </ScrollView>
          )}
        </LiquidPullRefresh>
      );
    }

    await render(<Host />);
    const scroll = screen.getByTestId('lpr-scroll');
    expect(scroll.props.overScrollMode).toBe('never');
    expect(scroll.props.bounces).toBe(false);

    await fireEvent(scroll, 'layout', { nativeEvent: { layout: { width: 390, height: 600 } } });
    await fireEvent(scroll, 'contentSizeChange', 390, 1200);
    await fireEvent.scroll(scroll, {
      nativeEvent: {
        contentOffset: { x: 0, y: 580 },
        contentSize: { width: 390, height: 1200 },
        layoutMeasurement: { width: 390, height: 600 },
      },
    });
    expect(onUserScroll).toHaveBeenCalledWith(580);

    await fireEvent(screen.getByTestId('lpr'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
