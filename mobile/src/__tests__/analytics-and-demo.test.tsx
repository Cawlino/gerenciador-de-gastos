/// <reference types="jest" />

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ExpoRouter from 'expo-router';
import AnalyticsScreen from '../../app/analytics';
import { PrivacyDemoProvider } from '../context/PrivacyDemoContext';
import {
  buildAccountBalanceSeries,
  buildAnalyticsDataset,
  buildCashFlowWaterfall,
  buildCategoryComparisons,
  buildDailySpendingPace,
  buildHabitsBreakdown,
  buildIncomeExpenseComboSeries,
  computeExecutiveKpis,
} from '../utils/analyticsHelpers';
import { createDemoApiClient } from '../utils/demoDataGenerator';
import { formatMaskedBRL, formatPrivacyBRL, getCurrentMonthSP, shiftYearMonth } from '../utils/format';

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

describe('Formatadores de Privacidade, Demo 12M e Helpers Analíticos', () => {
  it('mascara valores mantendo sinais no formatMaskedBRL / formatPrivacyBRL', () => {
    expect(formatMaskedBRL(1234.56)).toBe('R$ ••••');
    expect(formatMaskedBRL(1234.56, { signed: true })).toBe('+ R$ ••••');
    expect(formatMaskedBRL(-450.2, { signed: true })).toBe('- R$ ••••');
    expect(formatMaskedBRL(0, { signed: true })).toBe('R$ ••••');
    expect(formatPrivacyBRL(250, true)).toBe('R$ ••••');
    expect(formatPrivacyBRL(250, false)).toBe('R$ 250,00');
  });

  it('gera 12 meses completos determinísticos no createDemoApiClient com suporte a filtros e edições em memória', async () => {
    const fixedDate = new Date('2026-11-16T15:00:00.000Z');
    const demo = createDemoApiClient(fixedDate);
    const currentMonth = getCurrentMonthSP(fixedDate);

    const dash = await demo.getDashboard(currentMonth);
    expect(dash.available_months).toHaveLength(12);
    expect(dash.available_months[0]).toBe(currentMonth);
    expect(dash.income_total).toBeGreaterThan(0);
    expect(dash.expense_total).toBeGreaterThan(0);
    expect(dash.categories.length).toBeGreaterThanOrEqual(5);
    expect(dash.pending_count).toBeGreaterThanOrEqual(1);
    expect(dash.credit_cards).toHaveLength(1);

    const oldestMonth = dash.available_months[11];
    const oldDash = await demo.getDashboard(oldestMonth);
    expect(oldDash.month).toBe(oldestMonth);
    expect(oldDash.income_total).toBeGreaterThan(0);
    expect(oldDash.checking_balance).not.toBe(dash.checking_balance);

    const txs = await demo.getTransactions({ month: currentMonth, limit: 100 });
    expect(txs.results.length).toBeGreaterThan(10);

    const firstExpense = txs.results.find((t) => !t.effective_excluded && t.amount_norm < 0)!;
    const patched = await demo.patchTransaction(firstExpense.id, {
      categoryId: '18000000',
      applyToSimilar: true,
    });
    expect(patched.transaction.manual_category_id).toBe('18000000');
    expect(patched.ruleCreated).not.toBeNull();
  });

  it('calcula todos os 7 módulos analíticos corretamente a partir dos 12 meses', async () => {
    const fixedDate = new Date('2026-11-16T15:00:00.000Z');
    const demo = createDemoApiClient(fixedDate);
    const currentMonth = getCurrentMonthSP(fixedDate);

    const months12 = Array.from({ length: 12 }, (_, idx) =>
      shiftYearMonth(currentMonth, -(11 - idx)),
    );
    const dashboards12M = await Promise.all(months12.map((m) => demo.getDashboard(m)));
    const txRes = await demo.getTransactions({ limit: 500, includeExcluded: false });

    const kpis = computeExecutiveKpis(dashboards12M, txRes.results, currentMonth, '12M', fixedDate);
    expect(kpis.savingsRatePct).toBeGreaterThan(0);
    expect(kpis.dailyBurnRate).toBeGreaterThan(0);
    expect(kpis.cashRunwayMonths).toBeGreaterThan(0);
    expect(kpis.averageExpenseTicket).toBeGreaterThan(0);

    const balSeries = buildAccountBalanceSeries(dashboards12M, currentMonth, '6M');
    expect(balSeries).toHaveLength(6);
    expect(balSeries[5].month).toBe(currentMonth);

    const comboSeries = buildIncomeExpenseComboSeries(dashboards12M, currentMonth, '12M');
    expect(comboSeries).toHaveLength(12);

    const pace = buildDailySpendingPace(txRes.results, currentMonth, fixedDate);
    expect(pace.elapsedDays).toBe(16);
    expect(pace.currentSeries).toHaveLength(16);
    expect(pace.previousSeries.length).toBeGreaterThanOrEqual(28);

    const waterfall = buildCashFlowWaterfall(dashboards12M[11]);
    expect(waterfall[0].kind).toBe('income');
    expect(waterfall[waterfall.length - 1].kind).toBe('net');

    const comparisons = buildCategoryComparisons(dashboards12M, currentMonth);
    expect(comparisons.length).toBeGreaterThan(0);

    const habits = buildHabitsBreakdown(txRes.results, currentMonth, '12M');
    expect(habits.weekdayHeatmap).toHaveLength(7);
    expect(habits.topMerchants.length).toBeGreaterThan(0);
    expect(habits.channelSplit.checkingPct + habits.channelSplit.creditCardPct).toBeCloseTo(100, 0);

    const dataset = buildAnalyticsDataset({
      dashboards12M,
      transactions: txRes.results,
      selectedMonth: currentMonth,
      horizon: '12M',
      now: fixedDate,
    });
    expect(dataset.balanceSeries).toHaveLength(12);
    expect(dataset.incomeExpenseSeries).toHaveLength(12);
  });
});

describe('AnalyticsScreen (/analytics)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.restoreAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renderiza todos os gráficos/KPIs no modo Demo 12M, alterna horizonte 3M/6M/12M, filtra seções e mascara com o Olho', async () => {
    const backMock = jest.fn();
    jest.spyOn(ExpoRouter, 'useRouter').mockReturnValue({
      push: jest.fn(),
      back: backMock,
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    } as unknown as ReturnType<typeof ExpoRouter.useRouter>);
    jest.spyOn(ExpoRouter, 'useLocalSearchParams').mockReturnValue({
      month: getCurrentMonthSP(),
    });

    await render(
      <QueryClientProvider client={queryClient}>
        <PrivacyDemoProvider initialDemoMode>
          <AnalyticsScreen />
        </PrivacyDemoProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('analytics-kpi-grid')).toBeTruthy();
    });

    expect(screen.getByTestId('analytics-balance-area-chart')).toBeTruthy();
    expect(screen.getByTestId('analytics-income-expense-chart')).toBeTruthy();
    expect(screen.getByTestId('analytics-waterfall-chart')).toBeTruthy();
    expect(screen.getByTestId('analytics-spending-pace-chart')).toBeTruthy();
    expect(screen.getByTestId('analytics-channel-split')).toBeTruthy();
    expect(screen.getByTestId('analytics-category-comparison')).toBeTruthy();
    expect(screen.getByTestId('analytics-weekday-heatmap')).toBeTruthy();
    expect(screen.getByTestId('analytics-top-merchants')).toBeTruthy();

    // Troca horizonte para 3M
    await fireEvent.press(screen.getByTestId('analytics-horizon-3M'));
    expect(screen.getByText('Janela 3M')).toBeTruthy();

    // Filtra para seção Categorias & Hábitos (oculta gráficos de Conta & Fluxo)
    await fireEvent.press(screen.getByTestId('analytics-section-categories'));
    expect(screen.queryByTestId('analytics-balance-area-chart')).toBeNull();
    expect(screen.getByTestId('analytics-category-comparison')).toBeTruthy();

    // Volta para Visão Geral e ativa o Olho de Privacidade
    await fireEvent.press(screen.getByTestId('analytics-section-all'));
    await fireEvent.press(screen.getByTestId('analytics-privacy-toggle-btn'));
    expect(screen.getByTestId('analytics-balance-area-chart-active-value').props.children).toBe(
      'R$ ••••',
    );

    // Botão de recolher retorna ao Painel
    await fireEvent.press(screen.getByTestId('analytics-back-btn'));
    expect(backMock).toHaveBeenCalled();
  });
});
