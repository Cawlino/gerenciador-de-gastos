/// <reference types="jest" />

import type { CategoryDto, TransactionDto } from '../api/types';
import {
  computeMonthBounds,
  formatAccountShortLabel,
  formatCreditInstallmentLabel,
  formatMatchTypeBadge,
  getAvailableMatchOptions,
  getCategoryOriginLabel,
  getExcludedReasonLabel,
  getTransactionKindLabel,
  groupCategoriesByRoot,
  groupTransactionsByDay,
  mapTransactionToRowItem,
  normalizeSearchText,
} from '../utils/transactionHelpers';

function makeTx(overrides: Partial<TransactionDto> = {}): TransactionDto {
  return {
    id: 'tx-1',
    account_id: 'acc-1',
    account_name: 'Conta Corrente',
    account_type: 'BANK',
    account_subtype: 'CHECKING_ACCOUNT',
    occurred_at: '2026-11-11T15:30:00Z',
    occurred_date_sp: '2026-11-11',
    month_sp: '2026-11',
    description: 'Compra Exemplo',
    description_raw: null,
    amount_raw: 50,
    amount_norm: -50,
    pluggy_type: 'DEBIT',
    operation_type: 'PIX',
    status: 'POSTED',
    is_pending: false,
    kind: 'normal',
    paired_tx_id: null,
    pluggy_category_id: '05010000',
    rule_category_id: null,
    manual_category_id: null,
    effective_category_id: '05010000',
    category_name_pt: 'Alimentação',
    category_group_id: '05000000',
    category_group_name_pt: 'Alimentação',
    category_group_color: '#22D3EE',
    effective_excluded: false,
    manual_excluded: null,
    counterparty_name: null,
    counterparty_doc: null,
    merchant_name: null,
    merchant_cnpj: null,
    credit_card_metadata: null,
    ...overrides,
  };
}

describe('Helpers da tela de Transações', () => {
  it('agrupa transações por dia em America/Sao_Paulo preservando ordem', () => {
    const now = new Date('2026-11-11T18:00:00Z');
    const sections = groupTransactionsByDay(
      [
        makeTx({ id: '1', occurred_date_sp: '2026-11-11' }),
        makeTx({ id: '2', occurred_date_sp: '2026-11-11' }),
        makeTx({ id: '3', occurred_date_sp: '2026-11-10' }),
      ],
      now,
    );

    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe('Hoje · 11 Nov');
    expect(sections[0].count).toBe(2);
    expect(sections[1].title).toBe('Ontem · 10 Nov');
    expect(sections[1].count).toBe(1);
  });

  it('mapeia motivos de exclusão, origem de categoria e tipo contábil corretamente', () => {
    expect(
      getExcludedReasonLabel({ kind: 'bill_payment', manual_excluded: null, effective_excluded: true }),
    ).toBe('fatura pareada');
    expect(
      getExcludedReasonLabel({ kind: 'own_transfer', manual_excluded: null, effective_excluded: true }),
    ).toBe('transf. própria');
    expect(
      getExcludedReasonLabel({ kind: 'investment', manual_excluded: null, effective_excluded: true }),
    ).toBe('investimento');
    expect(
      getExcludedReasonLabel({ kind: 'normal', manual_excluded: true, effective_excluded: true }),
    ).toBe('ignorado manual');
    expect(
      getExcludedReasonLabel({ kind: 'normal', manual_excluded: null, effective_excluded: false }),
    ).toBeNull();

    expect(getCategoryOriginLabel({ manual_category_id: '1', rule_category_id: '2' })).toBe('Manual');
    expect(getCategoryOriginLabel({ manual_category_id: null, rule_category_id: '2' })).toBe('Regra automática');
    expect(getCategoryOriginLabel({ manual_category_id: null, rule_category_id: null })).toBe('Pluggy');

    expect(formatAccountShortLabel('CREDIT')).toBe('Cartão');
    expect(formatAccountShortLabel('BANK')).toBe('Conta');
    expect(getTransactionKindLabel('refund')).toBe('Estorno');
    expect(formatMatchTypeBadge('receiver_doc')).toBe('Recebedor');

    const row = mapTransactionToRowItem(makeTx({ account_type: 'CREDIT', status: 'PENDING' }));
    expect(row.accountLabel).toBe('Cartão');
    expect(row.status).toBe('PENDING');
  });

  it('agrupa e busca categorias sem sensibilidade a acentos deixando Outros por último', () => {
    const categories: CategoryDto[] = [
      {
        id: '99000000',
        description: 'Other',
        description_pt: 'Outros',
        parent_id: null,
        color: '#8B97AD',
        icon: null,
        group_id: '99000000',
        group_name_pt: 'Outros',
        group_color: '#8B97AD',
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
    ];

    const grouped = groupCategoriesByRoot(categories);
    expect(grouped.map((g) => g.groupName)).toEqual(['Alimentação', 'Outros']);
    expect(grouped[0].data.map((c) => c.description_pt)).toEqual(['Alimentação', 'Restaurantes']);

    const filtered = groupCategoriesByRoot(categories, 'alimentacao');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].data).toHaveLength(2);
    expect(normalizeSearchText('São Paulo')).toBe('sao paulo');
  });

  it('infere opções de correspondência R9 na ordem cnpj > receiver_doc > description_norm', () => {
    const opts = getAvailableMatchOptions({
      merchant_cnpj: '12345678000199',
      counterparty_doc: '98765432100',
      description_norm: 'PADARIA ALFA',
      description: 'Padaria Alfa',
    });
    expect(opts.map((o) => o.matchType)).toEqual(['cnpj', 'receiver_doc', 'description_norm']);
  });

  it('calcula limites do seletor de mês e formata parcela do cartão', () => {
    expect(computeMonthBounds(['2026-10', '2025-11', '2026-11'], '2026-11')).toEqual({
      minMonth: '2025-11',
      maxMonth: '2026-11',
    });
    expect(computeMonthBounds([], '2026-11')).toEqual({ maxMonth: '2026-11' });
    expect(formatCreditInstallmentLabel({ installmentNumber: 2, totalInstallments: 6 })).toBe(
      'Parcela 2/6',
    );
    expect(formatCreditInstallmentLabel({ installmentNumber: 1, totalInstallments: 1 })).toBeNull();
  });
});
