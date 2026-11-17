import type { ApiClient } from '../api/client';
import type {
  AccountDto,
  AppSettingsDto,
  CategoriesResponse,
  CategoryDto,
  DashboardCategorySlice,
  DashboardCreditCard,
  DashboardResponse,
  ItemsResponse,
  PatchTransactionInput,
  PluggyItemDto,
  RuleDto,
  RuleMatchType,
  SyncRunDto,
  TransactionDetailDto,
  TransactionDto,
  TransactionsQuery,
} from '../api/types';
import { getCurrentMonthSP, parseYearMonth, shiftYearMonth } from './format';

const DEMO_ITEM_ID = 'demo-item-inter-0001';
const DEMO_BANK_ACC_ID = 'demo-acc-bank-inter';
const DEMO_CARD_ACC_ID = 'demo-acc-credit-gold';

const DEMO_CATEGORIES: CategoryDto[] = [
  {
    id: '01000000',
    description: 'Income',
    description_pt: 'Renda',
    parent_id: null,
    color: '#34D399',
    icon: 'wallet',
    group_id: '01000000',
    group_name_pt: 'Renda',
    group_color: '#34D399',
    depth: 0,
  },
  {
    id: '01010000',
    description: 'Salary',
    description_pt: 'Salário',
    parent_id: '01000000',
    color: '#34D399',
    icon: 'wallet',
    group_id: '01000000',
    group_name_pt: 'Renda',
    group_color: '#34D399',
    depth: 1,
  },
  {
    id: '17000000',
    description: 'Housing',
    description_pt: 'Moradia',
    parent_id: null,
    color: '#22D3EE',
    icon: 'home',
    group_id: '17000000',
    group_name_pt: 'Moradia',
    group_color: '#22D3EE',
    depth: 0,
  },
  {
    id: '10000000',
    description: 'Groceries',
    description_pt: 'Supermercado',
    parent_id: null,
    color: '#A855F7',
    icon: 'shopping-cart',
    group_id: '10000000',
    group_name_pt: 'Supermercado',
    group_color: '#A855F7',
    depth: 0,
  },
  {
    id: '11000000',
    description: 'Food and drinks',
    description_pt: 'Alimentos e bebidas',
    parent_id: null,
    color: '#FB7185',
    icon: 'utensils',
    group_id: '11000000',
    group_name_pt: 'Alimentos e bebidas',
    group_color: '#FB7185',
    depth: 0,
  },
  {
    id: '11010000',
    description: 'Eating out',
    description_pt: 'Restaurantes',
    parent_id: '11000000',
    color: '#FB7185',
    icon: 'utensils',
    group_id: '11000000',
    group_name_pt: 'Alimentos e bebidas',
    group_color: '#FB7185',
    depth: 1,
  },
  {
    id: '19000000',
    description: 'Transport',
    description_pt: 'Transporte',
    parent_id: null,
    color: '#FBBF24',
    icon: 'car',
    group_id: '19000000',
    group_name_pt: 'Transporte',
    group_color: '#FBBF24',
    depth: 0,
  },
  {
    id: '19010000',
    description: 'Taxi and ride-hailing',
    description_pt: 'Táxi e transporte por app',
    parent_id: '19000000',
    color: '#FBBF24',
    icon: 'car',
    group_id: '19000000',
    group_name_pt: 'Transporte',
    group_color: '#FBBF24',
    depth: 1,
  },
  {
    id: '08000000',
    description: 'Shopping',
    description_pt: 'Compras',
    parent_id: null,
    color: '#60A5FA',
    icon: 'shopping-bag',
    group_id: '08000000',
    group_name_pt: 'Compras',
    group_color: '#60A5FA',
    depth: 0,
  },
  {
    id: '09000000',
    description: 'Digital services',
    description_pt: 'Serviços digitais',
    parent_id: null,
    color: '#F472B6',
    icon: 'zap',
    group_id: '09000000',
    group_name_pt: 'Serviços digitais',
    group_color: '#F472B6',
    depth: 0,
  },
  {
    id: '18000000',
    description: 'Healthcare',
    description_pt: 'Saúde',
    parent_id: null,
    color: '#818CF8',
    icon: 'heart-pulse',
    group_id: '18000000',
    group_name_pt: 'Saúde',
    group_color: '#818CF8',
    depth: 0,
  },
  {
    id: '03000000',
    description: 'Investments',
    description_pt: 'Investimentos',
    parent_id: null,
    color: '#34D399',
    icon: 'trending-up',
    group_id: '03000000',
    group_name_pt: 'Investimentos',
    group_color: '#34D399',
    depth: 0,
  },
  {
    id: '04000000',
    description: 'Same person transfer',
    description_pt: 'Transferência mesma titularidade',
    parent_id: null,
    color: '#94A3B8',
    icon: 'repeat',
    group_id: '04000000',
    group_name_pt: 'Transferência mesma titularidade',
    group_color: '#94A3B8',
    depth: 0,
  },
  {
    id: '05000000',
    description: 'Transfers',
    description_pt: 'Transferências',
    parent_id: null,
    color: '#94A3B8',
    icon: 'arrow-left-right',
    group_id: '05000000',
    group_name_pt: 'Transferências',
    group_color: '#94A3B8',
    depth: 0,
  },
  {
    id: '99999999',
    description: 'Other',
    description_pt: 'Outros',
    parent_id: null,
    color: '#94A3B8',
    icon: 'tag',
    group_id: '99999999',
    group_name_pt: 'Outros',
    group_color: '#94A3B8',
    depth: 0,
  },
];

const CATEGORY_MAP = new Map(DEMO_CATEGORIES.map((c) => [c.id, c]));

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function deterministicJitter(monthIdx: number, slot: number, min: number, max: number): number {
  const hash = Math.sin((monthIdx + 1) * 19.37 + (slot + 1) * 7.13) * 43758.5453;
  const frac = hash - Math.floor(hash);
  return round2(min + frac * (max - min));
}

function buildIsoSP(monthKey: string, day: number, hour = 12, minute = 15): string {
  const { year, month } = parseYearMonth(monthKey);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = Math.min(Math.max(1, day), maxDay);
  const utcHour = (hour + 3) % 24;
  return `${monthKey}-${String(safeDay).padStart(2, '0')}T${String(utcHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}

function buildDemoTx(params: {
  id: string;
  monthKey: string;
  day: number;
  hour?: number;
  minute?: number;
  accountType: 'BANK' | 'CREDIT';
  description: string;
  amountNorm: number;
  categoryId: string;
  operationType: string;
  status?: 'POSTED' | 'PENDING';
  kind?: string;
  pairedTxId?: string | null;
  merchantName?: string | null;
  merchantCnpj?: string | null;
  counterpartyName?: string | null;
  counterpartyDoc?: string | null;
}): TransactionDetailDto {
  const cat = CATEGORY_MAP.get(params.categoryId) ?? CATEGORY_MAP.get('99999999')!;
  const isBank = params.accountType === 'BANK';
  const occurredAt = buildIsoSP(params.monthKey, params.day, params.hour ?? 12, params.minute ?? 15);
  const occurredDateSp = occurredAt.slice(0, 10);
  const pluggyType: 'DEBIT' | 'CREDIT' = params.amountNorm >= 0 ? 'CREDIT' : 'DEBIT';
  const amountRaw = isBank ? params.amountNorm : -params.amountNorm;
  const kind = params.kind ?? 'normal';
  const effectiveExcluded =
    kind === 'bill_payment' || kind === 'own_transfer' || kind === 'investment';

  return {
    id: params.id,
    account_id: isBank ? DEMO_BANK_ACC_ID : DEMO_CARD_ACC_ID,
    account_name: isBank ? 'BANCO INTER' : 'GOLD',
    account_type: params.accountType,
    account_subtype: isBank ? 'CHECKING_ACCOUNT' : 'CREDIT_CARD',
    occurred_at: occurredAt,
    occurred_date_sp: occurredDateSp,
    month_sp: params.monthKey,
    description: params.description,
    description_raw: params.description,
    description_norm: params.description.toUpperCase().replace(/\s+/g, ' ').trim(),
    amount_raw: round2(amountRaw),
    amount_norm: round2(params.amountNorm),
    pluggy_type: pluggyType,
    operation_type: params.operationType,
    status: params.status ?? 'POSTED',
    is_pending: params.status === 'PENDING',
    kind,
    paired_tx_id: params.pairedTxId ?? null,
    pluggy_category_id: cat.id,
    rule_category_id: null,
    manual_category_id: null,
    effective_category_id: cat.id,
    category_name_pt: cat.description_pt,
    category_group_id: cat.group_id,
    category_group_name_pt: cat.group_name_pt,
    category_group_color: cat.group_color ?? '#94A3B8',
    effective_excluded: effectiveExcluded,
    manual_excluded: null,
    counterparty_name: params.counterpartyName ?? null,
    counterparty_doc: params.counterpartyDoc ?? null,
    merchant_name: params.merchantName ?? null,
    merchant_cnpj: params.merchantCnpj ?? null,
    credit_card_metadata: isBank
      ? null
      : { cardNumber: '4821', paymentType: 'SINGLE', billForecastDate: params.monthKey },
    payment_data: params.counterpartyName
      ? { receiver: { name: params.counterpartyName, documentNumber: { value: params.counterpartyDoc ?? '' } } }
      : null,
    merchant_data: params.merchantName
      ? { businessName: params.merchantName, cnpj: params.merchantCnpj ?? '' }
      : null,
    updated_at: occurredAt,
  };
}

function generateTwelveMonthsSeed(baseMonth: string): {
  months: string[];
  transactions: TransactionDetailDto[];
  checkingBalanceByMonth: Map<string, number>;
  currentCheckingBalance: number;
  creditCard: DashboardCreditCard;
} {
  const months = Array.from({ length: 12 }, (_, idx) => shiftYearMonth(baseMonth, -(11 - idx)));
  const transactions: TransactionDetailDto[] = [];
  const checkingBalanceByMonth = new Map<string, number>();

  let runningCheckingBalance = 4920.0;

  months.forEach((monthKey, idx) => {
    const isCurrentMonth = idx === months.length - 1;
    const { month: calMonth } = parseYearMonth(monthKey);
    const hasBonus = calMonth === 11 || calMonth === 12 || calMonth === 6;

    const salary = round2(8450 + idx * 75 + deterministicJitter(idx, 1, 0, 120));
    const freelance = deterministicJitter(idx, 2, 650, 1450);
    const bonus = hasBonus ? (calMonth === 12 ? 3200 : 1850) : 0;

    const monthTxs: TransactionDetailDto[] = [
      buildIsoTx(monthKey, idx, 'sal', 5, 9, 10, 'BANK', 'PIX RECEBIDO TECH CORP BRASIL', salary, '01010000', 'PIX', {
        counterpartyName: 'Tech Corp Brasil',
        counterpartyDoc: '12345678000199',
      }),
      buildIsoTx(monthKey, idx, 'freela', 18, 15, 40, 'BANK', 'PIX RECEBIDO CONSULTORIA PROJETO', freelance, '01010000', 'PIX', {
        counterpartyName: 'Consultoria Digital',
        counterpartyDoc: '98765432000110',
      }),
    ];

    if (bonus > 0) {
      monthTxs.push(
        buildIsoTx(
          monthKey,
          idx,
          'bonus',
          20,
          10,
          5,
          'BANK',
          calMonth === 12 ? '13 SALARIO PARCELA FINAL' : 'PLR / BONUS SEMESTRAL',
          bonus,
          '01010000',
          'TED',
          { counterpartyName: 'Tech Corp Brasil', counterpartyDoc: '12345678000199' },
        ),
      );
    }

    // Moradia (Aluguel + Condomínio + Energia/Internet)
    const rent = round2(-(2180 + (idx >= 6 ? 120 : 0)));
    const utilities = -deterministicJitter(idx, 3, 245, 325);
    monthTxs.push(
      buildIsoTx(monthKey, idx, 'rent', 6, 10, 30, 'BANK', 'PIX ENVIADO IMOBILIARIA HORIZONTE', rent, '17000000', 'PIX', {
        counterpartyName: 'Imobiliária Horizonte',
        counterpartyDoc: '44555666000188',
      }),
      buildIsoTx(monthKey, idx, 'util', 10, 11, 20, 'BANK', 'CEMIG / VIVO FIBRA CONTA', utilities, '17000000', 'BOLETO', {
        merchantName: 'Vivo Fibra & Energia',
      }),
    );

    // Supermercado (4 idas no mês)
    const groceries1 = -deterministicJitter(idx, 4, 290, 440);
    const groceries2 = -deterministicJitter(idx, 5, 220, 380);
    const groceries3 = -deterministicJitter(idx, 6, 180, 320);
    const groceries4 = -deterministicJitter(idx, 7, 150, 270);
    monthTxs.push(
      buildIsoTx(monthKey, idx, 'mkt1', 4, 18, 12, 'CREDIT', 'SUPERMERCADO VERDEMAR', groceries1, '10000000', 'PAGAMENTO', {
        merchantName: 'Supermercado Verdemar',
        merchantCnpj: '11222333000144',
      }),
      buildIsoTx(monthKey, idx, 'mkt2', 12, 19, 45, 'CREDIT', 'CARREFOUR HIPERMERCADO', groceries2, '10000000', 'PAGAMENTO', {
        merchantName: 'Carrefour',
        merchantCnpj: '45543915000181',
      }),
      buildIsoTx(monthKey, idx, 'mkt3', 20, 17, 30, 'BANK', 'PIX HORTIFRUTI NATURAL', groceries3, '10000000', 'PIX', {
        merchantName: 'Hortifruti Natural',
        counterpartyName: 'Hortifruti Natural',
      }),
      buildIsoTx(monthKey, idx, 'mkt4', 26, 16, 10, 'CREDIT', 'PAO DE ACUCAR EXPRESS', groceries4, '10000000', 'PAGAMENTO', {
        merchantName: 'Pão de Açúcar',
      }),
    );

    // Alimentos e bebidas (iFood / Restaurantes - concentrado em sex/sab/dom)
    const food1 = -deterministicJitter(idx, 8, 62, 135);
    const food2 = -deterministicJitter(idx, 9, 48, 110);
    const food3 = -deterministicJitter(idx, 10, 88, 175);
    const food4 = -deterministicJitter(idx, 11, 52, 125);
    const food5 = -deterministicJitter(idx, 12, 74, 155);
    monthTxs.push(
      buildIsoTx(monthKey, idx, 'food1', 3, 20, 15, 'CREDIT', 'IFOOD *BRISTO CENTRAL', food1, '11010000', 'PAGAMENTO', {
        merchantName: 'iFood',
        merchantCnpj: '14380200000121',
      }),
      buildIsoTx(monthKey, idx, 'food2', 8, 13, 5, 'CREDIT', 'OUTBACK STEAKHOUSE', food2, '11010000', 'PAGAMENTO', {
        merchantName: 'Outback Steakhouse',
      }),
      buildIsoTx(monthKey, idx, 'food3', 14, 21, 10, 'CREDIT', 'IFOOD *SUSHI HOUSE', food3, '11010000', 'PAGAMENTO', {
        merchantName: 'iFood',
        merchantCnpj: '14380200000121',
      }),
      buildIsoTx(monthKey, idx, 'food4', 22, 12, 40, 'BANK', 'PIX PADARIA ARTESANAL', food4, '11010000', 'PIX', {
        merchantName: 'Padaria Artesanal',
        counterpartyName: 'Padaria Artesanal',
      }),
      buildIsoTx(monthKey, idx, 'food5', 27, 20, 45, 'CREDIT', 'RESTAURANTE CANTINA BELLA', food5, '11010000', 'PAGAMENTO', {
        merchantName: 'Cantina Bella',
        status: isCurrentMonth ? 'PENDING' : 'POSTED',
      }),
    );

    // Transporte
    const tr1 = -deterministicJitter(idx, 13, 29, 64);
    const tr2 = -deterministicJitter(idx, 14, 145, 235);
    const tr3 = -deterministicJitter(idx, 15, 32, 78);
    monthTxs.push(
      buildIsoTx(monthKey, idx, 'tr1', 2, 8, 30, 'CREDIT', 'UBER *TRIP VIAGEM', tr1, '19010000', 'PAGAMENTO', {
        merchantName: 'Uber',
        merchantCnpj: '17895646000187',
      }),
      buildIsoTx(monthKey, idx, 'tr2', 16, 17, 20, 'CREDIT', 'POSTO SHELL AVENIDA', tr2, '19000000', 'PAGAMENTO', {
        merchantName: 'Posto Shell',
      }),
      buildIsoTx(monthKey, idx, 'tr3', 24, 22, 15, 'CREDIT', 'UBER *TRIP NOTURNA', tr3, '19010000', 'PAGAMENTO', {
        merchantName: 'Uber',
        merchantCnpj: '17895646000187',
        status: isCurrentMonth ? 'PENDING' : 'POSTED',
      }),
    );

    // Serviços Digitais
    monthTxs.push(
      buildIsoTx(monthKey, idx, 'dig1', 7, 6, 0, 'CREDIT', 'APPLE.COM/BILL ICLOUD', -49.9, '09000000', 'PAGAMENTO', {
        merchantName: 'Apple',
      }),
      buildIsoTx(monthKey, idx, 'dig2', 15, 7, 30, 'CREDIT', 'SPOTIFY + NETFLIX BRASIL', -94.8, '09000000', 'PAGAMENTO', {
        merchantName: 'Streaming Digital',
      }),
    );

    // Compras (e um estorno eventual)
    const shop1 = -deterministicJitter(idx, 16, 160, 520);
    monthTxs.push(
      buildIsoTx(monthKey, idx, 'shop1', 11, 14, 50, 'CREDIT', 'AMAZON BR MARKETPLACE', shop1, '08000000', 'PAGAMENTO', {
        merchantName: 'Amazon Brasil',
        merchantCnpj: '15436940000103',
      }),
    );
    if (idx % 3 === 1) {
      monthTxs.push(
        buildIsoTx(monthKey, idx, 'refund1', 19, 10, 0, 'CREDIT', 'ESTORNO AMAZON BR', 68.5, '08000000', 'PAGAMENTO', {
          kind: 'refund',
          merchantName: 'Amazon Brasil',
          merchantCnpj: '15436940000103',
        }),
      );
    }

    // Saúde
    const health1 = -deterministicJitter(idx, 17, 85, 210);
    monthTxs.push(
      buildIsoTx(monthKey, idx, 'hlth1', 9, 11, 45, 'CREDIT', 'DROGARIA ARAUJO / SMARTFIT', health1, '18000000', 'PAGAMENTO', {
        merchantName: 'Drogaria Araujo',
      }),
    );

    // Lançamentos ignorados por padrão (R2/R4/R5)
    const billPayAmt = round2(1890 + idx * 35);
    const bankBillId = `demo-tx-${monthKey}-bill-bank`;
    const cardBillId = `demo-tx-${monthKey}-bill-card`;
    monthTxs.push(
      buildIsoTx(monthKey, idx, 'cdb', 13, 10, 15, 'BANK', 'APLICACAO CDB INTER 102% CDI', -850.0, '03000000', 'OUTROS', {
        kind: 'investment',
      }),
      buildIsoTx(monthKey, idx, 'own', 17, 14, 0, 'BANK', 'PIX MESMA TITULARIDADE RESERVA', -450.0, '04000000', 'PIX', {
        kind: 'own_transfer',
        counterpartyName: 'Conta Própria',
      }),
      buildIsoTx(monthKey, idx, 'bill-bank', 10, 15, 0, 'BANK', 'PAGAMENTO FATURA CARTAO INTER', -billPayAmt, '05000000', 'BOLETO', {
        idOverride: bankBillId,
        kind: 'bill_payment',
        pairedTxId: cardBillId,
      }),
      buildIsoTx(monthKey, idx, 'bill-card', 10, 15, 5, 'CREDIT', 'PAGAMENTO ON LINE RECEBIDO', billPayAmt, '05000000', 'PAGAMENTO', {
        idOverride: cardBillId,
        kind: 'bill_payment',
        pairedTxId: bankBillId,
      }),
    );

    const monthNet = monthTxs
      .filter((t) => !t.effective_excluded)
      .reduce((acc, t) => acc + t.amount_norm, 0);
    runningCheckingBalance = round2(runningCheckingBalance + monthNet * 0.42);
    checkingBalanceByMonth.set(monthKey, runningCheckingBalance);

    transactions.push(...monthTxs);
  });

  // Ordena todas do mais recente para o mais antigo
  transactions.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

  const latestMonth = months[months.length - 1];
  const latestCardSpend = round2(
    transactions
      .filter((t) => t.month_sp === latestMonth && t.account_type === 'CREDIT' && !t.effective_excluded)
      .reduce((acc, t) => acc - t.amount_norm, 0),
  );
  const creditLimit = 9500;
  const invoiceBalance = Math.max(420, latestCardSpend);
  const availableCreditLimit = round2(Math.max(0, creditLimit - invoiceBalance));
  const nextMonth = shiftYearMonth(latestMonth, 1);

  const creditCard: DashboardCreditCard = {
    id: DEMO_CARD_ACC_ID,
    name: 'GOLD',
    level: 'GOLD',
    brand: 'MASTERCARD',
    invoice_balance: invoiceBalance,
    credit_limit: creditLimit,
    available_credit_limit: availableCreditLimit,
    minimum_payment: round2(invoiceBalance * 0.15),
    balance_close_date: `${nextMonth}-05T03:00:00.000Z`,
    balance_due_date: `${nextMonth}-15T03:00:00.000Z`,
    status: 'ACTIVE',
  };

  return {
    months,
    transactions,
    checkingBalanceByMonth,
    currentCheckingBalance: checkingBalanceByMonth.get(latestMonth) ?? 14820.45,
    creditCard,
  };
}

function buildIsoTx(
  monthKey: string,
  _idx: number,
  slug: string,
  day: number,
  hour: number,
  minute: number,
  accountType: 'BANK' | 'CREDIT',
  description: string,
  amountNorm: number,
  categoryId: string,
  operationType: string,
  extra?: {
    idOverride?: string;
    status?: 'POSTED' | 'PENDING';
    kind?: string;
    pairedTxId?: string | null;
    merchantName?: string | null;
    merchantCnpj?: string | null;
    counterpartyName?: string | null;
    counterpartyDoc?: string | null;
  },
): TransactionDetailDto {
  return buildDemoTx({
    id: extra?.idOverride ?? `demo-tx-${monthKey}-${slug}`,
    monthKey,
    day,
    hour,
    minute,
    accountType,
    description,
    amountNorm,
    categoryId,
    operationType,
    status: extra?.status,
    kind: extra?.kind,
    pairedTxId: extra?.pairedTxId,
    merchantName: extra?.merchantName,
    merchantCnpj: extra?.merchantCnpj,
    counterpartyName: extra?.counterpartyName,
    counterpartyDoc: extra?.counterpartyDoc,
  });
}

function resolveEffectiveExcluded(tx: TransactionDetailDto, settings: AppSettingsDto): boolean {
  if (tx.manual_excluded !== null) return tx.manual_excluded;
  if (tx.kind === 'bill_payment') return true;
  if (tx.kind === 'own_transfer') return settings.exclude_own_transfers ?? true;
  if (tx.kind === 'investment') return settings.exclude_investments ?? true;
  return false;
}

/**
 * Cria uma instância em memória de `ApiClient` populada com 12 meses de transações fictícias realistas.
 * Opera 100% isolada do backend Supabase e dos dados reais do usuário.
 */
export function createDemoApiClient(referenceNow = new Date()): ApiClient {
  const baseMonth = getCurrentMonthSP(referenceNow);
  const seed = generateTwelveMonthsSeed(baseMonth);
  const lastSyncedAt = referenceNow.toISOString();

  const settings: AppSettingsDto = {
    exclude_own_transfers: true,
    exclude_investments: true,
  };

  let transactions: TransactionDetailDto[] = seed.transactions.map((t) => ({ ...t }));
  const rules: RuleDto[] = [
    {
      id: 'demo-rule-1',
      match_type: 'cnpj',
      match_value: '14380200000121',
      category_id: '11010000',
      priority: 100,
      label: 'iFood',
      active: true,
      created_at: `${baseMonth}-01T12:00:00.000Z`,
      category_name_pt: 'Restaurantes',
    },
    {
      id: 'demo-rule-2',
      match_type: 'cnpj',
      match_value: '17895646000187',
      category_id: '19010000',
      priority: 100,
      label: 'Uber',
      active: true,
      created_at: `${baseMonth}-02T12:00:00.000Z`,
      category_name_pt: 'Táxi e transporte por app',
    },
  ];

  const syncRuns: SyncRunDto[] = [
    {
      id: 'demo-sync-run-1',
      item_id: DEMO_ITEM_ID,
      trigger: 'manual',
      status: 'success',
      fetched_count: transactions.length,
      upserted_count: transactions.length,
      paired_count: 12,
      error_message: null,
      started_at: lastSyncedAt,
      finished_at: lastSyncedAt,
    },
  ];

  const availableMonthsDesc = [...seed.months].reverse();

  function refreshDerivedFields() {
    transactions = transactions.map((tx) => {
      const catId = tx.manual_category_id ?? tx.rule_category_id ?? tx.pluggy_category_id ?? '99999999';
      const cat = CATEGORY_MAP.get(catId) ?? CATEGORY_MAP.get('99999999')!;
      return {
        ...tx,
        effective_category_id: cat.id,
        category_name_pt: cat.description_pt,
        category_group_id: cat.group_id,
        category_group_name_pt: cat.group_name_pt,
        category_group_color: cat.group_color ?? '#94A3B8',
        effective_excluded: resolveEffectiveExcluded(tx, settings),
      };
    });
  }

  function applyRule(matchType: RuleMatchType, matchValue: string, categoryId: string): number {
    let count = 0;
    const normValue = matchValue.toUpperCase().replace(/\s+/g, ' ').trim();
    transactions = transactions.map((tx) => {
      if (tx.manual_category_id !== null) return tx;
      const matches =
        (matchType === 'cnpj' && tx.merchant_cnpj === matchValue) ||
        (matchType === 'receiver_doc' && tx.counterparty_doc === matchValue) ||
        (matchType === 'description_norm' && tx.description_norm === normValue);
      if (!matches) return tx;
      count += 1;
      return { ...tx, rule_category_id: categoryId };
    });
    refreshDerivedFields();
    return count;
  }

  return {
    health: async () => ({ ok: true, service: 'gastos-demo-12m' }),

    getDashboard: async (month?: string): Promise<DashboardResponse> => {
      const targetMonth = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : baseMonth;
      const monthTxs = transactions.filter((t) => t.month_sp === targetMonth);

      let incomeTotal = 0;
      let expenseTotal = 0;
      let pendingCount = 0;
      let pendingExpenseTotal = 0;
      let excludedCount = 0;

      const catTotals = new Map<
        string,
        { category_id: string; name_pt: string; color: string; total: number; tx_count: number }
      >();

      for (const tx of monthTxs) {
        if (tx.effective_excluded) {
          excludedCount += 1;
          continue;
        }
        if (tx.is_pending) {
          pendingCount += 1;
        }
        if (tx.amount_norm > 0 && tx.kind !== 'refund') {
          incomeTotal += tx.amount_norm;
        } else if (tx.amount_norm < 0 || tx.kind === 'refund') {
          const spentImpact = -tx.amount_norm;
          expenseTotal += spentImpact;
          if (tx.is_pending) {
            pendingExpenseTotal += spentImpact;
          }
          const existing = catTotals.get(tx.category_group_id) ?? {
            category_id: tx.category_group_id,
            name_pt: tx.category_group_name_pt,
            color: tx.category_group_color,
            total: 0,
            tx_count: 0,
          };
          existing.total = round2(existing.total + spentImpact);
          existing.tx_count += 1;
          catTotals.set(tx.category_group_id, existing);
        }
      }

      const roundedIncome = round2(incomeTotal);
      const roundedExpense = round2(Math.max(0, expenseTotal));
      const positiveCats = Array.from(catTotals.values()).filter((c) => c.total > 0);
      const grandCatTotal = positiveCats.reduce((acc, c) => acc + c.total, 0);

      const categories: DashboardCategorySlice[] = positiveCats
        .sort((a, b) => b.total - a.total || a.name_pt.localeCompare(b.name_pt))
        .map((c) => ({
          ...c,
          percentage: grandCatTotal > 0 ? round2((c.total / grandCatTotal) * 100) : 0,
        }));

      const checkingBalance =
        seed.checkingBalanceByMonth.get(targetMonth) ?? seed.currentCheckingBalance;

      return {
        month: targetMonth,
        checking_balance: checkingBalance,
        credit_card: seed.creditCard,
        credit_cards: [seed.creditCard],
        last_synced_at: lastSyncedAt,
        item_status: 'UPDATED',
        consent_expires_at: shiftYearMonth(baseMonth, 10) + '-15T12:00:00.000Z',
        income_total: roundedIncome,
        expense_total: roundedExpense,
        net_total: round2(roundedIncome - roundedExpense),
        pending_count: pendingCount,
        pending_expense_total: round2(pendingExpenseTotal),
        excluded_count: excludedCount,
        categories,
        available_months: availableMonthsDesc.includes(targetMonth)
          ? availableMonthsDesc
          : [targetMonth, ...availableMonthsDesc],
        settings: { ...settings },
      };
    },

    getTransactions: async (query?: TransactionsQuery) => {
      const month = query?.month;
      const type = query?.type ?? 'all';
      const accountId = query?.accountId;
      const categoryId = query?.categoryId;
      const q = query?.q?.trim().toLowerCase();
      const includeExcluded = query?.includeExcluded !== false;
      const limit = Math.min(Math.max(query?.limit ?? 100, 1), 500);
      const offset = Math.max(query?.offset ?? 0, 0);

      const filtered = transactions.filter((tx) => {
        if (month && tx.month_sp !== month) return false;
        if (accountId && tx.account_id !== accountId) return false;
        if (
          categoryId &&
          tx.effective_category_id !== categoryId &&
          tx.category_group_id !== categoryId
        ) {
          return false;
        }
        if (q) {
          const hay = `${tx.description} ${tx.merchant_name ?? ''} ${tx.counterparty_name ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (type === 'all') return includeExcluded || !tx.effective_excluded;
        if (type === 'income') return !tx.effective_excluded && tx.amount_norm > 0 && tx.kind !== 'refund';
        if (type === 'expense') return !tx.effective_excluded && (tx.amount_norm < 0 || tx.kind === 'refund');
        if (type === 'excluded') return tx.effective_excluded;
        return true;
      });

      const results: TransactionDto[] = filtered.slice(offset, offset + limit);
      return { results, limit, offset };
    },

    getTransaction: async (id: string) => {
      const found = transactions.find((t) => t.id === id);
      if (!found) {
        throw new Error('Transação simulada não encontrada.');
      }
      return found;
    },

    patchTransaction: async (id: string, input: PatchTransactionInput) => {
      const idx = transactions.findIndex((t) => t.id === id);
      if (idx < 0) {
        throw new Error('Transação simulada não encontrada.');
      }

      const current = transactions[idx];
      transactions[idx] = {
        ...current,
        manual_category_id:
          input.categoryId !== undefined ? input.categoryId : current.manual_category_id,
        manual_excluded:
          input.excluded !== undefined ? input.excluded : current.manual_excluded,
        updated_at: new Date().toISOString(),
      };
      refreshDerivedFields();

      let ruleCreated: { id: string; matchType: RuleMatchType; matchValue: string } | null = null;
      let affectedSimilarCount = 0;

      if (input.applyToSimilar && input.categoryId) {
        const matchType: RuleMatchType =
          input.matchType ??
          (current.merchant_cnpj
            ? 'cnpj'
            : current.counterparty_doc
              ? 'receiver_doc'
              : 'description_norm');
        const matchValue =
          matchType === 'cnpj'
            ? (current.merchant_cnpj ?? current.description_norm)
            : matchType === 'receiver_doc'
              ? (current.counterparty_doc ?? current.description_norm)
              : current.description_norm;

        affectedSimilarCount = applyRule(matchType, matchValue, input.categoryId);
        const ruleId = `demo-rule-${rules.length + 1}`;
        const cat = CATEGORY_MAP.get(input.categoryId);
        rules.unshift({
          id: ruleId,
          match_type: matchType,
          match_value: matchValue,
          category_id: input.categoryId,
          priority: 100,
          label: current.merchant_name || current.counterparty_name || current.description.slice(0, 40),
          active: true,
          created_at: new Date().toISOString(),
          category_name_pt: cat?.description_pt ?? 'Categoria',
        });
        ruleCreated = { id: ruleId, matchType, matchValue };
      }

      return {
        transaction: transactions[idx],
        ruleCreated,
        affectedSimilarCount,
      };
    },

    getCategories: async (): Promise<CategoriesResponse> => ({
      results: DEMO_CATEGORIES,
    }),

    getRules: async () => ({
      results: [...rules],
    }),

    createRule: async (input) => {
      const ruleId = `demo-rule-${rules.length + 1}`;
      const cat = CATEGORY_MAP.get(input.categoryId);
      rules.unshift({
        id: ruleId,
        match_type: input.matchType,
        match_value: input.matchValue,
        category_id: input.categoryId,
        priority: 100,
        label: input.label ?? null,
        active: true,
        created_at: new Date().toISOString(),
        category_name_pt: cat?.description_pt ?? 'Categoria',
      });
      const affectedCount = applyRule(input.matchType, input.matchValue, input.categoryId);
      return { id: ruleId, affectedCount };
    },

    deleteRule: async (id: string) => {
      const idx = rules.findIndex((r) => r.id === id);
      if (idx >= 0) rules.splice(idx, 1);
      return { deleted: true, id };
    },

    getSettings: async () => ({
      settings: { ...settings },
    }),

    updateSettings: async (input) => {
      if (input.exclude_own_transfers !== undefined) {
        settings.exclude_own_transfers = input.exclude_own_transfers;
      }
      if (input.exclude_investments !== undefined) {
        settings.exclude_investments = input.exclude_investments;
      }
      refreshDerivedFields();
      return { settings: { ...settings } };
    },

    getItems: async (): Promise<ItemsResponse> => {
      const items: PluggyItemDto[] = [
        {
          id: DEMO_ITEM_ID,
          connector_id: 200,
          connector_name: 'Banco Inter · Demo 12M',
          connector_color: '#FF7A00',
          status: 'UPDATED',
          execution_status: 'SUCCESS',
          error_code: null,
          error_message: null,
          consent_expires_at: shiftYearMonth(baseMonth, 10) + '-15T12:00:00.000Z',
          last_updated_at: lastSyncedAt,
          last_synced_at: lastSyncedAt,
          next_auto_sync_at: lastSyncedAt,
        },
      ];

      const accounts: AccountDto[] = [
        {
          id: DEMO_BANK_ACC_ID,
          item_id: DEMO_ITEM_ID,
          type: 'BANK',
          subtype: 'CHECKING_ACCOUNT',
          name: 'BANCO INTER',
          marketing_name: 'Conta Digital Inter (Demo)',
          number_masked: '0009182-4',
          balance: seed.currentCheckingBalance,
          currency_code: 'BRL',
          credit_data: null,
          updated_at: lastSyncedAt,
        },
        {
          id: DEMO_CARD_ACC_ID,
          item_id: DEMO_ITEM_ID,
          type: 'CREDIT',
          subtype: 'CREDIT_CARD',
          name: 'GOLD',
          marketing_name: 'Cartão Inter Gold (Demo)',
          number_masked: '4821',
          balance: seed.creditCard.invoice_balance,
          currency_code: 'BRL',
          credit_data: {
            level: seed.creditCard.level,
            brand: seed.creditCard.brand,
            creditLimit: seed.creditCard.credit_limit,
            availableCreditLimit: seed.creditCard.available_credit_limit,
            minimumPayment: seed.creditCard.minimum_payment,
            balanceCloseDate: seed.creditCard.balance_close_date,
            balanceDueDate: seed.creditCard.balance_due_date,
            status: seed.creditCard.status,
          },
          updated_at: lastSyncedAt,
        },
      ];

      return { items, accounts, syncRuns: [...syncRuns] };
    },

    registerItem: async () => ({
      registered: true,
      itemId: DEMO_ITEM_ID,
    }),

    sync: async (input) => {
      const nowIso = new Date().toISOString();
      const syncRunId = `demo-sync-run-${syncRuns.length + 1}`;
      syncRuns.unshift({
        id: syncRunId,
        item_id: DEMO_ITEM_ID,
        trigger: input?.trigger ?? 'pull_to_refresh',
        status: 'success',
        fetched_count: transactions.length,
        upserted_count: 0,
        paired_count: 12,
        error_message: null,
        started_at: nowIso,
        finished_at: nowIso,
      });
      return {
        ok: true,
        sync: {
          itemId: DEMO_ITEM_ID,
          syncRunId,
          accountsSynced: 2,
          categoriesSynced: DEMO_CATEGORIES.length,
          fetchedCount: transactions.length,
          upsertedCount: 0,
          pairedCount: 12,
          lastSyncedAt: nowIso,
        },
      };
    },

    createConnectToken: async () => ({
      accessToken: 'demo-connect-token',
    }),
  };
}
