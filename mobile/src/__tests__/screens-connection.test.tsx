/// <reference types="jest" />

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ExpoRouter from 'expo-router';
import { apiClient } from '../api/client';
import type { DashboardResponse, ItemsResponse, SettingsResponse } from '../api/types';
import DashboardScreen from '../../app/(tabs)/index';
import SettingsScreen from '../../app/(tabs)/settings';
import ConnectScreen from '../../app/connect';

const SAMPLE_ITEM_ID = '11111111-2222-4333-8444-555555555555';

function makeItemsPayload(): ItemsResponse {
  return {
    items: [
      {
        id: SAMPLE_ITEM_ID,
        connector_id: 211,
        connector_name: 'Banco Inter',
        connector_color: '#FF7A00',
        status: 'UPDATED',
        execution_status: 'SUCCESS',
        error_code: null,
        error_message: null,
        consent_expires_at: '2027-05-01T12:00:00Z',
        last_updated_at: '2026-11-11T15:00:00Z',
        last_synced_at: '2026-11-11T15:05:00Z',
        next_auto_sync_at: null,
      },
    ],
    accounts: [
      {
        id: 'acc-bank-1',
        item_id: SAMPLE_ITEM_ID,
        type: 'BANK',
        subtype: 'CHECKING_ACCOUNT',
        name: 'Conta Corrente',
        marketing_name: 'Inter Conta Digital',
        number_masked: '•••• 4321',
        balance: 3450.25,
        currency_code: 'BRL',
        credit_data: null,
        updated_at: '2026-11-11T15:05:00Z',
      },
      {
        id: 'acc-credit-1',
        item_id: SAMPLE_ITEM_ID,
        type: 'CREDIT',
        subtype: 'CREDIT_CARD',
        name: 'Cartão Inter Gold',
        marketing_name: null,
        number_masked: '•••• 9876',
        balance: 890.5,
        currency_code: 'BRL',
        credit_data: { availableCreditLimit: 4109.5 },
        updated_at: '2026-11-11T15:05:00Z',
      },
    ],
    syncRuns: [
      {
        id: 'run-1',
        item_id: SAMPLE_ITEM_ID,
        trigger: 'manual',
        status: 'success',
        fetched_count: 148,
        upserted_count: 148,
        paired_count: 4,
        error_message: null,
        started_at: '2026-11-11T15:05:00Z',
        finished_at: '2026-11-11T15:05:12Z',
      },
    ],
  };
}

function makeSettingsPayload(overrides?: Partial<SettingsResponse['settings']>): SettingsResponse {
  return {
    settings: {
      exclude_own_transfers: true,
      exclude_investments: true,
      ...overrides,
    },
  };
}

function makeDashboardPayload(): DashboardResponse {
  return {
    month: '2026-11',
    checking_balance: 3450.25,
    credit_card: null,
    credit_cards: [],
    last_synced_at: '2026-11-11T15:05:00Z',
    item_status: 'UPDATED',
    consent_expires_at: '2027-05-01T12:00:00Z',
    income_total: 8500,
    expense_total: 2150.4,
    net_total: 6349.6,
    pending_count: 1,
    pending_expense_total: 120,
    excluded_count: 2,
    categories: [
      {
        category_id: '05010000',
        name_pt: 'Alimentação',
        color: '#FF9F0A',
        total: 1120.4,
        tx_count: 8,
        percentage: 52.1,
      },
    ],
    available_months: ['2026-11', '2026-10'],
    settings: {
      exclude_own_transfers: true,
      exclude_investments: true,
    },
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

describe('Telas conectadas (Conexão, Painel e Pluggy Connect)', () => {
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

  it('exibe item conectado, contas e histórico na tela Conexão e dispara sync incremental e 12 meses', async () => {
    jest.spyOn(apiClient, 'getItems').mockResolvedValue(makeItemsPayload());
    jest.spyOn(apiClient, 'getSettings').mockResolvedValue(makeSettingsPayload());
    const syncSpy = jest.spyOn(apiClient, 'sync').mockResolvedValue({
      ok: true,
      sync: {
        itemId: SAMPLE_ITEM_ID,
        syncRunId: 'run-2',
        accountsSynced: 2,
        categoriesSynced: 48,
        fetchedCount: 35,
        upsertedCount: 35,
        pairedCount: 2,
        lastSyncedAt: '2026-11-11T15:20:00Z',
      },
    });

    await render(wrap(<SettingsScreen />));

    expect(screen.getByTestId('connection-loading')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId('connection-status-card')).toBeTruthy();
    });

    expect(screen.getByText('Banco Inter')).toBeTruthy();
    expect(screen.getByText('Conectado')).toBeTruthy();
    expect(screen.getByText('Inter Conta Digital')).toBeTruthy();
    expect(screen.getByText('Cartão Inter Gold')).toBeTruthy();
    expect(screen.getByText('148 lidas · 148 salvas · 4 pareadas')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('sync-now-button'));
    await waitFor(() => {
      expect(syncSpy).toHaveBeenCalledWith({
        itemId: SAMPLE_ITEM_ID,
        refresh: true,
        fullSync: false,
        trigger: 'manual',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('sync-feedback-banner')).toBeTruthy();
    });
    expect(screen.getByText('Sync concluído: 35 lidas · 35 salvas · 2 pareadas')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('sync-full-button'));
    await waitFor(() => {
      expect(syncSpy).toHaveBeenCalledWith({
        itemId: SAMPLE_ITEM_ID,
        refresh: false,
        fullSync: true,
        trigger: 'manual',
      });
    });
  });

  it('valida UUID no cadastro manual de Item e alterna preferências R4/R5', async () => {
    jest.spyOn(apiClient, 'getItems').mockResolvedValue({
      items: [],
      accounts: [],
      syncRuns: [],
    });
    jest.spyOn(apiClient, 'getSettings').mockResolvedValue(makeSettingsPayload());
    const registerSpy = jest.spyOn(apiClient, 'registerItem').mockResolvedValue({
      registered: true,
      itemId: SAMPLE_ITEM_ID,
      sync: {
        itemId: SAMPLE_ITEM_ID,
        syncRunId: 'run-init',
        accountsSynced: 2,
        categoriesSynced: 48,
        fetchedCount: 120,
        upsertedCount: 120,
        pairedCount: 6,
        lastSyncedAt: '2026-11-11T15:30:00Z',
      },
    });
    const updateSettingsSpy = jest
      .spyOn(apiClient, 'updateSettings')
      .mockResolvedValue(makeSettingsPayload({ exclude_own_transfers: false }));

    await render(wrap(<SettingsScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('accounts-empty')).toBeTruthy();
    });

    await fireEvent.changeText(screen.getByTestId('item-id-input'), 'uuid-invalido');
    await fireEvent.press(screen.getByTestId('register-item-button'));

    expect(screen.getByTestId('connection-form-error')).toBeTruthy();
    expect(registerSpy).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('item-id-input'), SAMPLE_ITEM_ID);
    await fireEvent.press(screen.getByTestId('register-item-button'));

    await waitFor(() => {
      expect(registerSpy).toHaveBeenCalledWith({ itemId: SAMPLE_ITEM_ID, sync: true });
    });

    await fireEvent(screen.getByTestId('toggle-own-transfers'), 'valueChange', false);
    await waitFor(() => {
      expect(updateSettingsSpy).toHaveBeenCalledWith({ exclude_own_transfers: false });
    });
  });

  it('permite tentar novamente quando GET /items falha', async () => {
    const getItemsSpy = jest
      .spyOn(apiClient, 'getItems')
      .mockRejectedValueOnce(new Error('Falha de rede'))
      .mockResolvedValueOnce(makeItemsPayload());
    jest.spyOn(apiClient, 'getSettings').mockResolvedValue(makeSettingsPayload());

    await render(wrap(<SettingsScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('connection-error-card')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('connection-retry-button'));
    await waitFor(() => {
      expect(getItemsSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('connection-status-card')).toBeTruthy();
    });
  });

  it('exibe saldo em conta corrente no Painel e navega para Conexão', async () => {
    const pushMock = jest.fn();
    jest.spyOn(ExpoRouter, 'useRouter').mockReturnValue({
      push: pushMock,
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    } as unknown as ReturnType<typeof ExpoRouter.useRouter>);

    jest.spyOn(apiClient, 'getDashboard').mockResolvedValue(makeDashboardPayload());

    await render(wrap(<DashboardScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-checking-balance')).toBeTruthy();
    });

    expect(screen.getByTestId('dashboard-checking-balance').props.children).toBe('R$ 3.450,25');
    await fireEvent.press(screen.getByTestId('dashboard-status-pill-btn'));
    expect(pushMock).toHaveBeenCalledWith('/(tabs)/settings');
  });

  it('solicita connectToken no modal Pluggy Connect e registra o item retornado no onSuccess', async () => {
    const backMock = jest.fn();
    jest.spyOn(ExpoRouter, 'useRouter').mockReturnValue({
      push: jest.fn(),
      back: backMock,
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    } as unknown as ReturnType<typeof ExpoRouter.useRouter>);
    jest.spyOn(ExpoRouter, 'useLocalSearchParams').mockReturnValue({ itemId: SAMPLE_ITEM_ID });

    const tokenSpy = jest
      .spyOn(apiClient, 'createConnectToken')
      .mockResolvedValue({ accessToken: 'connect-tok-xyz' });
    const registerSpy = jest.spyOn(apiClient, 'registerItem').mockResolvedValue({
      registered: true,
      itemId: SAMPLE_ITEM_ID,
    });

    await render(wrap(<ConnectScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('pluggy-connect-mock')).toBeTruthy();
    });

    expect(tokenSpy).toHaveBeenCalledWith({ itemId: SAMPLE_ITEM_ID });
    const widget = screen.getByTestId('pluggy-connect-mock');
    expect(widget.props.connectToken).toBe('connect-tok-xyz');
    expect(widget.props.updateItem).toBe(SAMPLE_ITEM_ID);

    await act(async () => {
      (widget.props.onSuccess as (payload: { item: { id: string } }) => void)({
        item: { id: SAMPLE_ITEM_ID },
      });
    });

    await waitFor(() => {
      expect(registerSpy).toHaveBeenCalledWith({ itemId: SAMPLE_ITEM_ID, sync: true });
      expect(backMock).toHaveBeenCalled();
    });
  });
});
