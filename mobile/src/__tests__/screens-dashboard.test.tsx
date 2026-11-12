/// <reference types="jest" />

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ExpoRouter from 'expo-router';
import { apiClient } from '../api/client';
import type { DashboardResponse } from '../api/types';
import { formatMonthLabel, getCurrentMonthSP, shiftYearMonth } from '../utils/format';
import DashboardScreen from '../../app/(tabs)/index';

const CURRENT_MONTH = getCurrentMonthSP();
const PREV_MONTH = shiftYearMonth(CURRENT_MONTH, -1);

function makeDashboardPayload(overrides?: Partial<DashboardResponse>): DashboardResponse {
  return {
    month: CURRENT_MONTH,
    checking_balance: 3450.25,
    credit_card: {
      id: 'acc-credit-gold',
      name: 'GOLD',
      level: 'GOLD',
      brand: 'MASTERCARD',
      invoice_balance: 412.3,
      credit_limit: 2050,
      available_credit_limit: 1637.7,
      minimum_payment: 61.85,
      balance_close_date: '2026-12-05T03:00:00.000Z',
      balance_due_date: '2026-12-15T03:00:00.000Z',
      status: 'ACTIVE',
    },
    credit_cards: [
      {
        id: 'acc-credit-gold',
        name: 'GOLD',
        level: 'GOLD',
        brand: 'MASTERCARD',
        invoice_balance: 412.3,
        credit_limit: 2050,
        available_credit_limit: 1637.7,
        minimum_payment: 61.85,
        balance_close_date: '2026-12-05T03:00:00.000Z',
        balance_due_date: '2026-12-15T03:00:00.000Z',
        status: 'ACTIVE',
      },
    ],
    last_synced_at: '2026-11-11T15:05:00Z',
    item_status: 'UPDATED',
    consent_expires_at: '2027-05-01T12:00:00Z',
    income_total: 8500,
    expense_total: 2150.4,
    net_total: 6349.6,
    pending_count: 2,
    pending_expense_total: 120.5,
    excluded_count: 3,
    categories: [
      {
        category_id: '05000000',
        name_pt: 'Alimentação',
        color: '#22D3EE',
        total: 1120.4,
        tx_count: 8,
        percentage: 52.1,
      },
      {
        category_id: '06000000',
        name_pt: 'Transporte',
        color: '#A855F7',
        total: 1030,
        tx_count: 5,
        percentage: 47.9,
      },
    ],
    available_months: [CURRENT_MONTH, PREV_MONTH],
    settings: {
      exclude_own_transfers: true,
      exclude_investments: true,
    },
    ...overrides,
  };
}

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

describe('DashboardScreen (Fase 8 — Painel completo)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  function wrap(ui: React.ReactElement) {
    return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
  }

  function mockRouterPush() {
    const pushMock = jest.fn();
    jest.spyOn(ExpoRouter, 'useRouter').mockReturnValue({
      push: pushMock,
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    } as unknown as ReturnType<typeof ExpoRouter.useRouter>);
    return pushMock;
  }

  it('renderiza saldo, receitas, despesas, Cartão Inter Gold e rosca por categoria', async () => {
    mockRouterPush();
    jest.spyOn(apiClient, 'getDashboard').mockResolvedValue(makeDashboardPayload());

    await render(wrap(<DashboardScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-checking-balance')).toBeTruthy();
    });

    expect(screen.getByTestId('dashboard-checking-balance').props.children).toBe('R$ 3.450,25');
    expect(screen.getByTestId('dashboard-income-total').props.children).toBe('+ R$ 8.500,00');
    expect(screen.getByTestId('dashboard-expense-total').props.children).toBe('- R$ 2.150,40');
    expect(screen.getByTestId('dashboard-net-total').props.children).toBe('+ R$ 6.349,60');
    expect(screen.getByText('2 pendente(s) · R$ 120,50')).toBeTruthy();
    expect(screen.getByText('3 ignorada(s)')).toBeTruthy();

    expect(screen.getByTestId('dashboard-credit-card')).toBeTruthy();
    expect(screen.getByText('Cartão Inter Gold')).toBeTruthy();
    expect(screen.getByTestId('dashboard-card-invoice').props.children).toBe('R$ 412,30');
    expect(screen.getByTestId('dashboard-card-available-limit').props.children).toBe('R$ 1.637,70');
    expect(screen.getByTestId('dashboard-card-due-date').props.children).toBe('15/12');
    expect(screen.getByText('Uso 20% de R$ 2.050,00')).toBeTruthy();
    expect(screen.getByText('Fecha 05/12')).toBeTruthy();

    expect(screen.getByTestId('dashboard-donut-chart')).toBeTruthy();
    expect(screen.getByTestId('donut-legend-05000000')).toBeTruthy();
    expect(screen.getByTestId('donut-legend-06000000')).toBeTruthy();
  });

  it('navega meses via MonthSwitcher e filtra Transações por tipo, cartão e fatia do donut', async () => {
    const pushMock = mockRouterPush();
    const curData = makeDashboardPayload();
    const prevData = makeDashboardPayload({
      month: PREV_MONTH,
      income_total: 5200,
      expense_total: 1800,
      net_total: 3400,
      categories: [
        {
          category_id: '05000000',
          name_pt: 'Alimentação',
          color: '#22D3EE',
          total: 1800,
          tx_count: 6,
          percentage: 100,
        },
      ],
    });

    const getDashboardSpy = jest
      .spyOn(apiClient, 'getDashboard')
      .mockImplementation(async (month) => (month === PREV_MONTH ? prevData : curData));

    await render(wrap(<DashboardScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-checking-balance')).toBeTruthy();
    });

    const currentMonth = screen.getByTestId('month-label').props.children;
    expect(currentMonth).toBe(formatMonthLabel(CURRENT_MONTH));

    await fireEvent.press(screen.getByTestId('month-prev'));
    await waitFor(() => {
      expect(getDashboardSpy).toHaveBeenCalledWith(PREV_MONTH);
      expect(screen.getByTestId('dashboard-income-total').props.children).toBe('+ R$ 5.200,00');
    });

    await fireEvent.press(screen.getByTestId('dashboard-income-card'));
    expect(pushMock).toHaveBeenCalledWith(`/(tabs)/transactions?month=${PREV_MONTH}&type=income`);

    await fireEvent.press(screen.getByTestId('dashboard-expense-card'));
    expect(pushMock).toHaveBeenCalledWith(`/(tabs)/transactions?month=${PREV_MONTH}&type=expense`);

    await fireEvent.press(screen.getByTestId('dashboard-excluded-pill'));
    expect(pushMock).toHaveBeenCalledWith(`/(tabs)/transactions?month=${PREV_MONTH}&type=excluded`);

    await fireEvent.press(screen.getByTestId('dashboard-credit-card'));
    expect(pushMock).toHaveBeenCalledWith(
      `/(tabs)/transactions?month=${PREV_MONTH}&accountId=acc-credit-gold`,
    );

    await fireEvent.press(screen.getByTestId('donut-legend-05000000'));
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-donut-go-transactions')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('dashboard-donut-go-transactions'));
    expect(pushMock).toHaveBeenCalledWith(
      `/(tabs)/transactions?month=${PREV_MONTH}&type=expense&categoryId=05000000`,
    );
  });

  it('trata erro no carregamento com Tentar novamente, alerta reconexão e pull-to-refresh', async () => {
    const pushMock = mockRouterPush();
    const getDashboardSpy = jest
      .spyOn(apiClient, 'getDashboard')
      .mockRejectedValueOnce(new Error('Falha temporária'))
      .mockResolvedValue(makeDashboardPayload({ item_status: 'LOGIN_ERROR' }));

    const syncSpy = jest.spyOn(apiClient, 'sync').mockResolvedValue({
      ok: true,
      sync: {
        itemId: 'item-1',
        syncRunId: 'run-99',
        accountsSynced: 2,
        categoriesSynced: 0,
        fetchedCount: 15,
        upsertedCount: 4,
        pairedCount: 0,
        lastSyncedAt: '2026-11-12T03:00:00Z',
      },
    });

    await render(wrap(<DashboardScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-error-card')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('dashboard-retry-button'));
    await waitFor(() => {
      expect(getDashboardSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('dashboard-reconnect-banner')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('dashboard-reconnect-action'));
    expect(pushMock).toHaveBeenCalledWith('/(tabs)/settings');

    const scrollView = screen.getByTestId('dashboard-scroll');
    await act(async () => {
      scrollView.props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(syncSpy).toHaveBeenCalledWith({
        refresh: true,
        fullSync: false,
        trigger: 'pull_to_refresh',
      });
      expect(screen.getByTestId('dashboard-sync-notice')).toBeTruthy();
    });
  });
});
