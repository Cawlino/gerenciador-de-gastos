/// <reference types="jest" />

import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ExpoRouter from 'expo-router';
import { apiClient } from '../api/client';
import type {
  CategoriesResponse,
  DashboardResponse,
  ItemsResponse,
  RulesResponse,
  TransactionDetailDto,
  TransactionDto,
} from '../api/types';
import RulesScreen from '../../app/rules';
import TransactionDetailScreen from '../../app/transaction/[id]';
import TransactionsScreen from '../../app/(tabs)/transactions';

const SAMPLE_ITEM_ID = '11111111-2222-4333-8444-555555555555';

function makeCategoriesPayload(): CategoriesResponse {
  return {
    results: [
      {
        id: '05000000',
        description: 'Food',
        description_pt: 'Alimentação',
        parent_id: null,
        color: '#22D3EE',
        icon: null,
        group_id: '05000000',
        group_name_pt: 'Alimentação',
        group_color: '#22D3EE',
        depth: 0,
      },
      {
        id: '05010000',
        description: 'Restaurants',
        description_pt: 'Restaurantes',
        parent_id: '05000000',
        color: '#22D3EE',
        icon: null,
        group_id: '05000000',
        group_name_pt: 'Alimentação',
        group_color: '#22D3EE',
        depth: 1,
      },
      {
        id: '05020000',
        description: 'Supermarket',
        description_pt: 'Supermercado',
        parent_id: '05000000',
        color: '#22D3EE',
        icon: null,
        group_id: '05000000',
        group_name_pt: 'Alimentação',
        group_color: '#22D3EE',
        depth: 1,
      },
      {
        id: '06000000',
        description: 'Transport',
        description_pt: 'Transporte',
        parent_id: null,
        color: '#A855F7',
        icon: null,
        group_id: '06000000',
        group_name_pt: 'Transporte',
        group_color: '#A855F7',
        depth: 0,
      },
    ],
  };
}

function makeDashboardPayload(): DashboardResponse {
  return {
    month: '2026-11',
    checking_balance: 1500,
    credit_card: null,
    credit_cards: [],
    last_synced_at: '2026-11-11T15:00:00Z',
    item_status: 'UPDATED',
    consent_expires_at: null,
    income_total: 4000,
    expense_total: 1200,
    net_total: 2800,
    pending_count: 1,
    pending_expense_total: 45,
    excluded_count: 1,
    categories: [],
    available_months: ['2026-11', '2026-10', '2026-09'],
    settings: { exclude_own_transfers: true, exclude_investments: true },
  };
}

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
        consent_expires_at: null,
        last_updated_at: '2026-11-11T15:00:00Z',
        last_synced_at: '2026-11-11T15:00:00Z',
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
        marketing_name: null,
        number_masked: '•••• 1111',
        balance: 1500,
        currency_code: 'BRL',
        credit_data: null,
        updated_at: '2026-11-11T15:00:00Z',
      },
      {
        id: 'acc-credit-1',
        item_id: SAMPLE_ITEM_ID,
        type: 'CREDIT',
        subtype: 'CREDIT_CARD',
        name: 'Cartão Gold',
        marketing_name: null,
        number_masked: '•••• 2222',
        balance: 320,
        currency_code: 'BRL',
        credit_data: null,
        updated_at: '2026-11-11T15:00:00Z',
      },
    ],
    syncRuns: [],
  };
}

function makeTxRows(): TransactionDto[] {
  return [
    {
      id: 'tx-1',
      account_id: 'acc-credit-1',
      account_name: 'Cartão Gold',
      account_type: 'CREDIT',
      account_subtype: 'CREDIT_CARD',
      occurred_at: '2026-11-11T16:20:00Z',
      occurred_date_sp: '2026-11-11',
      month_sp: '2026-11',
      description: 'Padaria Alfa',
      description_raw: 'PADARIA ALFA LTDA',
      amount_raw: 45,
      amount_norm: -45,
      pluggy_type: 'DEBIT',
      operation_type: 'CARTAO',
      status: 'PENDING',
      is_pending: true,
      kind: 'normal',
      paired_tx_id: null,
      pluggy_category_id: '05010000',
      rule_category_id: null,
      manual_category_id: null,
      effective_category_id: '05010000',
      category_name_pt: 'Restaurantes',
      category_group_id: '05000000',
      category_group_name_pt: 'Alimentação',
      category_group_color: '#22D3EE',
      effective_excluded: false,
      manual_excluded: null,
      counterparty_name: null,
      counterparty_doc: null,
      merchant_name: 'Padaria Alfa',
      merchant_cnpj: '12345678000199',
      credit_card_metadata: { installmentNumber: 2, totalInstallments: 4 },
    },
    {
      id: 'tx-2',
      account_id: 'acc-bank-1',
      account_name: 'Conta Corrente',
      account_type: 'BANK',
      account_subtype: 'CHECKING_ACCOUNT',
      occurred_at: '2026-11-10T14:00:00Z',
      occurred_date_sp: '2026-11-10',
      month_sp: '2026-11',
      description: 'Pagamento de fatura',
      description_raw: null,
      amount_raw: 500,
      amount_norm: -500,
      pluggy_type: 'DEBIT',
      operation_type: 'PAGAMENTO',
      status: 'POSTED',
      is_pending: false,
      kind: 'bill_payment',
      paired_tx_id: 'tx-3',
      pluggy_category_id: '06000000',
      rule_category_id: null,
      manual_category_id: null,
      effective_category_id: '06000000',
      category_name_pt: 'Transporte',
      category_group_id: '06000000',
      category_group_name_pt: 'Transporte',
      category_group_color: '#A855F7',
      effective_excluded: true,
      manual_excluded: null,
      counterparty_name: null,
      counterparty_doc: null,
      merchant_name: null,
      merchant_cnpj: null,
      credit_card_metadata: null,
    },
  ];
}

function makeTxDetail(overrides: Partial<TransactionDetailDto> = {}): TransactionDetailDto {
  return {
    ...makeTxRows()[0],
    description_norm: 'PADARIA ALFA',
    payment_data: null,
    merchant_data: null,
    updated_at: '2026-11-11T16:25:00Z',
    counterparty_doc: '99887766000111',
    ...overrides,
  };
}

function makeRulesPayload(): RulesResponse {
  return {
    results: [
      {
        id: 'rule-1',
        match_type: 'cnpj',
        match_value: '12345678000199',
        category_id: '05020000',
        priority: 100,
        label: 'Mercado Exemplo',
        active: true,
        created_at: '2026-11-10T12:00:00Z',
        category_name_pt: 'Supermercado',
      },
    ],
  };
}

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe('Telas da Fase 7 (Transações, Detalhe/R9 e Regras)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.spyOn(ExpoRouter, 'useLocalSearchParams').mockReturnValue({ month: '2026-11' });
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  function wrap(ui: React.ReactElement) {
    return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
  }

  it('renderiza extrato agrupado por dia, filtra por tipo/conta e navega para o detalhe', async () => {
    const pushMock = jest.fn();
    jest.spyOn(ExpoRouter, 'useRouter').mockReturnValue({
      push: pushMock,
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    } as unknown as ReturnType<typeof ExpoRouter.useRouter>);

    jest.spyOn(apiClient, 'getDashboard').mockResolvedValue(makeDashboardPayload());
    jest.spyOn(apiClient, 'getItems').mockResolvedValue(makeItemsPayload());
    jest.spyOn(apiClient, 'getCategories').mockResolvedValue(makeCategoriesPayload());
    jest.spyOn(apiClient, 'getRules').mockResolvedValue(makeRulesPayload());
    const txSpy = jest
      .spyOn(apiClient, 'getTransactions')
      .mockResolvedValue({ results: makeTxRows(), limit: 200, offset: 0 });

    await render(wrap(<TransactionsScreen />));

    await waitFor(() => {
      expect(screen.getByText('Padaria Alfa')).toBeTruthy();
    });

    expect(screen.getByText('Regras (1)')).toBeTruthy();
    expect(screen.getByText('pendente')).toBeTruthy();
    expect(screen.getByText('fatura pareada')).toBeTruthy();
    expect(screen.getByTestId('tx-day-2026-11-11')).toBeTruthy();
    expect(screen.getByTestId('tx-day-2026-11-10')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('tx-filter-expense'));
    await waitFor(() => {
      expect(txSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'expense' }));
    });

    await fireEvent.press(screen.getByTestId('tx-account-CREDIT'));
    await waitFor(() => {
      expect(txSpy).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-credit-1' }));
      expect(screen.getByTestId('tx-row-tx-1')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('tx-row-tx-1'));
    expect(pushMock).toHaveBeenCalledWith('/transaction/tx-1');
  }, 15000);

  it('filtra transações por busca textual e seletor modal de categorias', async () => {
    jest.spyOn(apiClient, 'getDashboard').mockResolvedValue(makeDashboardPayload());
    jest.spyOn(apiClient, 'getItems').mockResolvedValue(makeItemsPayload());
    jest.spyOn(apiClient, 'getCategories').mockResolvedValue(makeCategoriesPayload());
    jest.spyOn(apiClient, 'getRules').mockResolvedValue({ results: [] });
    const txSpy = jest
      .spyOn(apiClient, 'getTransactions')
      .mockResolvedValue({ results: makeTxRows(), limit: 200, offset: 0 });

    await render(wrap(<TransactionsScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('tx-search-toggle-btn')).toBeTruthy();
    });
    expect(screen.queryByTestId('tx-search-input')).toBeNull();

    await fireEvent.press(screen.getByTestId('tx-search-toggle-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('tx-search-input')).toBeTruthy();
    });

    await fireEvent.changeText(screen.getByTestId('tx-search-input'), 'Padaria');
    await waitFor(
      () => {
        expect(txSpy).toHaveBeenCalledWith(expect.objectContaining({ q: 'Padaria' }));
      },
      { timeout: 2000 },
    );

    await fireEvent.press(screen.getByTestId('tx-search-clear'));
    await waitFor(() => {
      expect(txSpy).toHaveBeenCalledWith(expect.objectContaining({ q: undefined }));
    });

    await fireEvent.press(screen.getByTestId('tx-category-filter-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('category-option-05020000')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('category-option-05020000'));
    await waitFor(() => {
      expect(txSpy).toHaveBeenCalledWith(expect.objectContaining({ categoryId: '05020000' }));
    });

    await fireEvent.press(screen.getByTestId('tx-category-filter-clear'));
    await waitFor(() => {
      expect(txSpy).toHaveBeenCalledWith(expect.objectContaining({ categoryId: undefined }));
    });
  }, 15000);

  it('limpa filtros a partir do estado vazio do extrato', async () => {
    jest.spyOn(ExpoRouter, 'useLocalSearchParams').mockReturnValue({
      month: '2026-11',
      type: 'expense',
    });
    jest.spyOn(apiClient, 'getDashboard').mockResolvedValue(makeDashboardPayload());
    jest.spyOn(apiClient, 'getItems').mockResolvedValue(makeItemsPayload());
    jest.spyOn(apiClient, 'getCategories').mockResolvedValue(makeCategoriesPayload());
    jest.spyOn(apiClient, 'getRules').mockResolvedValue({ results: [] });
    const txSpy = jest
      .spyOn(apiClient, 'getTransactions')
      .mockResolvedValue({ results: [], limit: 200, offset: 0 });

    await render(wrap(<TransactionsScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('transactions-empty')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('tx-clear-filters-btn'));
    await waitFor(() => {
      expect(txSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'all' }));
    });
  }, 15000);

  it('recategoriza transação com Aplicar a semelhantes (R9) e envia PATCH correto', async () => {
    jest.spyOn(ExpoRouter, 'useLocalSearchParams').mockReturnValue({ id: 'tx-1' });
    jest.spyOn(apiClient, 'getTransaction').mockResolvedValue(makeTxDetail());
    jest.spyOn(apiClient, 'getCategories').mockResolvedValue(makeCategoriesPayload());
    const patchSpy = jest.spyOn(apiClient, 'patchTransaction').mockResolvedValue({
      transaction: {
        ...makeTxRows()[0],
        effective_category_id: '05020000',
        category_name_pt: 'Supermercado',
      },
      ruleCreated: { id: 'rule-99', matchType: 'receiver_doc', matchValue: '99887766000111' },
      affectedSimilarCount: 4,
    });

    await render(wrap(<TransactionDetailScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('tx-detail-description')).toBeTruthy();
    });

    expect(screen.getByTestId('tx-detail-description').props.children).toBe('Padaria Alfa');
    expect(screen.getByText('Parcela 2/4')).toBeTruthy();
    expect(screen.getByText('Pluggy')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('change-category-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('category-option-05020000')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('category-option-05020000'));

    await fireEvent(screen.getByTestId('toggle-apply-similar'), 'valueChange', true);
    await waitFor(() => {
      expect(screen.getByTestId('match-option-receiver_doc')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('match-option-receiver_doc'));

    await fireEvent.press(screen.getByTestId('save-tx-changes-btn'));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('tx-1', {
        categoryId: '05020000',
        applyToSimilar: true,
        matchType: 'receiver_doc',
      });
    });

    await waitFor(() => {
      expect(
        screen.getByText('Salvo! Regra aplicada em 4 lançamento(s) semelhante(s).'),
      ).toBeTruthy();
    });
  }, 15000);

  it('alterna exclusão manual no detalhe da transação sem alterar categoria', async () => {
    jest.spyOn(ExpoRouter, 'useLocalSearchParams').mockReturnValue({ id: 'tx-1' });
    jest.spyOn(apiClient, 'getTransaction').mockResolvedValue(makeTxDetail());
    jest.spyOn(apiClient, 'getCategories').mockResolvedValue(makeCategoriesPayload());
    const patchSpy = jest.spyOn(apiClient, 'patchTransaction').mockResolvedValue({
      transaction: { ...makeTxRows()[0], effective_excluded: true, manual_excluded: true },
      ruleCreated: null,
      affectedSimilarCount: 0,
    });

    await render(wrap(<TransactionDetailScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('toggle-exclude-tx')).toBeTruthy();
    });

    await fireEvent(screen.getByTestId('toggle-exclude-tx'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('save-tx-changes-btn'));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('tx-1', { excluded: true });
    });
  }, 15000);

  it('permite visualizar e remover regras R9 na tela de Regras', async () => {
    jest.spyOn(apiClient, 'getRules').mockResolvedValue(makeRulesPayload());
    const deleteSpy = jest
      .spyOn(apiClient, 'deleteRule')
      .mockResolvedValue({ deleted: true, id: 'rule-1' });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    await render(wrap(<RulesScreen />));

    await waitFor(() => {
      expect(screen.getByText('Mercado Exemplo')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('delete-rule-rule-1'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const buttons = alertSpy.mock.calls[0]?.[2];
    const destructive = Array.isArray(buttons)
      ? buttons.find((btn) => btn.style === 'destructive')
      : undefined;
    await act(async () => {
      destructive?.onPress?.();
    });
    alertSpy.mockRestore();

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('rule-1');
    });
  }, 15000);

  it('aplica filtros pré-selecionados via URL vindos do Painel (mês, categoria e conta)', async () => {
    jest.spyOn(ExpoRouter, 'useLocalSearchParams').mockReturnValue({
      month: '2026-10',
      type: 'expense',
      categoryId: '05000000',
      accountId: 'acc-credit-1',
    });
    jest.spyOn(apiClient, 'getDashboard').mockResolvedValue(makeDashboardPayload());
    jest.spyOn(apiClient, 'getItems').mockResolvedValue(makeItemsPayload());
    jest.spyOn(apiClient, 'getCategories').mockResolvedValue(makeCategoriesPayload());
    jest.spyOn(apiClient, 'getRules').mockResolvedValue(makeRulesPayload());
    const getTxSpy = jest.spyOn(apiClient, 'getTransactions').mockResolvedValue({
      results: [makeTxRows()[1]],
      limit: 200,
      offset: 0,
    });

    await render(wrap(<TransactionsScreen />));

    await waitFor(() => {
      expect(getTxSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          month: '2026-10',
          type: 'expense',
          categoryId: '05000000',
          accountId: 'acc-credit-1',
        }),
      );
    });
  }, 15000);
});
