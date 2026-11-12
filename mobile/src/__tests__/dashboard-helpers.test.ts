/// <reference types="jest" />

import type { DashboardCategorySlice, DashboardCreditCard, DashboardResponse } from '../api/types';
import { DONUT_PALETTE } from '../theme/tokens';
import {
  buildTransactionsRoute,
  computeCreditLimitUsage,
  formatCreditCardMeta,
  formatCreditCardTitle,
  formatShortDayMonth,
  isConsentExpiringSoon,
  mapDashboardCategoriesToDonutSlices,
  resolveCreditCards,
} from '../utils/dashboardHelpers';

function makeCard(overrides?: Partial<DashboardCreditCard>): DashboardCreditCard {
  return {
    id: 'card-gold-1',
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
    ...overrides,
  };
}

function makeDashboard(overrides?: Partial<DashboardResponse>): DashboardResponse {
  return {
    month: '2026-11',
    checking_balance: 152.45,
    credit_card: makeCard(),
    credit_cards: [makeCard()],
    last_synced_at: '2026-11-11T15:00:00Z',
    item_status: 'UPDATED',
    consent_expires_at: '2027-05-01T12:00:00Z',
    income_total: 4280,
    expense_total: 4127.55,
    net_total: 152.45,
    pending_count: 1,
    pending_expense_total: 45,
    excluded_count: 3,
    categories: [],
    available_months: ['2026-11', '2026-10'],
    settings: {
      exclude_own_transfers: true,
      exclude_investments: true,
    },
    ...overrides,
  };
}

describe('dashboardHelpers', () => {
  it('monta rotas para Transações com filtros válidos', () => {
    expect(buildTransactionsRoute({})).toBe('/(tabs)/transactions');
    expect(buildTransactionsRoute({ month: '2026-11', type: 'all' })).toBe(
      '/(tabs)/transactions?month=2026-11',
    );
    expect(
      buildTransactionsRoute({
        month: '2026-10',
        type: 'expense',
        categoryId: '05000000',
        accountId: 'acc-1',
      }),
    ).toBe('/(tabs)/transactions?month=2026-10&type=expense&categoryId=05000000&accountId=acc-1');
  });

  it('formata datas curtas dd/MM no fuso de São Paulo sem desvio de calendário', () => {
    expect(formatShortDayMonth('2026-12-15T03:00:00.000Z')).toBe('15/12');
    expect(formatShortDayMonth('2026-12-05')).toBe('05/12');
    expect(formatShortDayMonth(null)).toBe('—');
    expect(formatShortDayMonth('data-invalida')).toBe('—');
  });

  it('mapeia categorias do painel para DonutCategorySlice filtrando valores zerados', () => {
    const raw: DashboardCategorySlice[] = [
      {
        category_id: '05000000',
        name_pt: 'Alimentação',
        color: '#22D3EE',
        total: 1200,
        tx_count: 10,
        percentage: 60,
      },
      {
        category_id: '06000000',
        name_pt: 'Transporte',
        color: '',
        total: 800,
        tx_count: 5,
        percentage: 40,
      },
      {
        category_id: '09000000',
        name_pt: 'Zero',
        color: '#888888',
        total: 0,
        tx_count: 0,
        percentage: 0,
      },
    ];

    const slices = mapDashboardCategoriesToDonutSlices(raw);
    expect(slices).toEqual([
      {
        id: '05000000',
        name: 'Alimentação',
        amount: 1200,
        percent: 60,
        color: '#22D3EE',
      },
      {
        id: '06000000',
        name: 'Transporte',
        amount: 800,
        percent: 40,
        color: DONUT_PALETTE[1],
      },
    ]);
  });

  it('resolve cartões priorizando credit_cards com fallback em credit_card', () => {
    const primary = makeCard();
    expect(resolveCreditCards(undefined)).toEqual([]);
    expect(resolveCreditCards(makeDashboard({ credit_cards: [], credit_card: primary }))).toEqual([
      primary,
    ]);
    expect(resolveCreditCards(makeDashboard({ credit_cards: [], credit_card: null }))).toEqual([]);
  });

  it('formata título, metadados e uso de limite do cartão Gold', () => {
    const card = makeCard();
    expect(formatCreditCardTitle(card)).toBe('Cartão Inter Gold');
    expect(formatCreditCardTitle(makeCard({ name: 'Inter Black' }))).toBe('Inter Black');
    expect(formatCreditCardMeta(card)).toBe('GOLD · MASTERCARD');
    expect(formatCreditCardMeta(makeCard({ level: null, brand: null }))).toBe('Cartão de crédito');

    const usage = computeCreditLimitUsage(card);
    expect(usage.hasLimit).toBe(true);
    expect(usage.usedPercent).toBe(20);
    expect(usage.usedRatio).toBeCloseTo(412.3 / 2050, 5);
    expect(computeCreditLimitUsage(makeCard({ credit_limit: 0 }))).toEqual({
      usedRatio: 0,
      usedPercent: 0,
      hasLimit: false,
    });
  });

  it('detecta consentimento expirando ou já expirado dentro da janela de 14 dias', () => {
    const now = new Date('2026-11-12T12:00:00Z');
    expect(isConsentExpiringSoon('2026-11-20T12:00:00Z', now)).toBe(true);
    expect(isConsentExpiringSoon('2026-11-01T12:00:00Z', now)).toBe(true);
    expect(isConsentExpiringSoon('2027-01-10T12:00:00Z', now)).toBe(false);
    expect(isConsentExpiringSoon(null, now)).toBe(false);
  });
});
