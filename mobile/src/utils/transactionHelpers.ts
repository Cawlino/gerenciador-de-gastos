import type {
  CategoryDto,
  RuleMatchType,
  TransactionDetailDto,
  TransactionDto,
} from '../api/types';
import type { TransactionRowItem } from '../components';
import { COLORS, DONUT_PALETTE } from '../theme/tokens';
import { formatDayGroupLabel, getCurrentMonthSP } from './format';

export interface TransactionDaySection {
  dateKey: string;
  title: string;
  count: number;
  data: TransactionDto[];
}

export interface CategoryGroupSection {
  groupId: string;
  groupName: string;
  groupColor: string;
  rootCategory: CategoryDto | null;
  data: CategoryDto[];
}

export interface MatchCriterionOption {
  matchType: RuleMatchType;
  label: string;
  preview: string;
}

const MONTH_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Normaliza texto removendo acentos e padronizando minúsculas para busca local.
 */
export function normalizeSearchText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Rótulo curto da origem da conta para subtítulo da linha de transação.
 */
export function formatAccountShortLabel(accountType: 'BANK' | 'CREDIT'): string {
  return accountType === 'CREDIT' ? 'Cartão' : 'Conta';
}

/**
 * Rótulo legível do motivo pelo qual a transação foi excluída dos totais.
 */
export function getExcludedReasonLabel(
  tx: Pick<TransactionDto, 'kind' | 'manual_excluded' | 'effective_excluded'>,
): string | null {
  if (!tx.effective_excluded) return null;
  if (tx.manual_excluded === true) return 'ignorado manual';
  if (tx.kind === 'bill_payment') return 'fatura pareada';
  if (tx.kind === 'own_transfer') return 'transf. própria';
  if (tx.kind === 'investment') return 'investimento';
  return 'ignorado';
}

/**
 * Indica qual camada determinou a categoria efetiva da transação.
 */
export function getCategoryOriginLabel(
  tx: Pick<TransactionDto, 'manual_category_id' | 'rule_category_id'>,
): 'Manual' | 'Regra automática' | 'Pluggy' {
  if (tx.manual_category_id) return 'Manual';
  if (tx.rule_category_id) return 'Regra automática';
  return 'Pluggy';
}

/**
 * Traduz `kind` técnico do backend para rótulo em português.
 */
export function getTransactionKindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case 'bill_payment':
      return 'Pagamento de fatura';
    case 'own_transfer':
      return 'Mesma titularidade';
    case 'investment':
      return 'Investimento';
    case 'refund':
      return 'Estorno';
    default:
      return 'Lançamento comum';
  }
}

/**
 * Converte DTO da API em item visual para o componente `TransactionRow`.
 */
export function mapTransactionToRowItem(tx: TransactionDto): TransactionRowItem {
  const accent =
    tx.category_group_color ||
    (tx.amount_norm > 0 && tx.kind !== 'refund' ? COLORS.neon.mint : COLORS.neon.cyan);

  return {
    id: tx.id,
    description: tx.description,
    categoryName: tx.category_name_pt || tx.category_group_name_pt || 'Sem categoria',
    categoryColor: accent,
    accountLabel: formatAccountShortLabel(tx.account_type),
    amountNorm: tx.amount_norm,
    date: tx.occurred_at,
    status: tx.status,
    effectiveExcluded: tx.effective_excluded,
    excludedReason: getExcludedReasonLabel(tx),
  };
}

/**
 * Agrupa transações por data local (`occurred_date_sp`) preservando a ordenação descendente.
 */
export function groupTransactionsByDay(
  transactions: TransactionDto[],
  now = new Date(),
): TransactionDaySection[] {
  const buckets = new Map<string, TransactionDto[]>();

  for (const tx of transactions) {
    const key = tx.occurred_date_sp || tx.occurred_at.slice(0, 10);
    const list = buckets.get(key);
    if (list) {
      list.push(tx);
    } else {
      buckets.set(key, [tx]);
    }
  }

  return Array.from(buckets.entries()).map(([dateKey, data]) => {
    const anchorIso = /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
      ? `${dateKey}T12:00:00-03:00`
      : data[0]?.occurred_at ?? dateKey;
    return {
      dateKey,
      title: formatDayGroupLabel(anchorIso, now),
      count: data.length,
      data,
    };
  });
}

/**
 * Agrupa categorias PT-BR pelo grupo-pai raiz e filtra por termo de busca.
 */
export function groupCategoriesByRoot(
  categories: CategoryDto[],
  searchQuery = '',
): CategoryGroupSection[] {
  const term = normalizeSearchText(searchQuery);
  const filtered = term
    ? categories.filter((c) => {
        const hay = `${c.description_pt} ${c.group_name_pt} ${c.description}`;
        return normalizeSearchText(hay).includes(term);
      })
    : categories;

  const map = new Map<string, CategoryGroupSection>();

  filtered.forEach((cat, idx) => {
    const groupId = cat.group_id || cat.id;
    const existing = map.get(groupId);
    const isRoot = cat.depth === 0 || cat.id === groupId;

    if (existing) {
      existing.data.push(cat);
      if (isRoot && !existing.rootCategory) {
        existing.rootCategory = cat;
      }
      return;
    }

    map.set(groupId, {
      groupId,
      groupName: cat.group_name_pt || cat.description_pt,
      groupColor:
        cat.group_color || cat.color || DONUT_PALETTE[idx % DONUT_PALETTE.length],
      rootCategory: isRoot ? cat : null,
      data: [cat],
    });
  });

  const sections = Array.from(map.values()).map((section) => ({
    ...section,
    data: section.data.slice().sort((a, b) => {
      const aRoot = a.depth === 0 || a.id === section.groupId ? 0 : 1;
      const bRoot = b.depth === 0 || b.id === section.groupId ? 0 : 1;
      if (aRoot !== bRoot) return aRoot - bRoot;
      return a.description_pt.localeCompare(b.description_pt, 'pt-BR');
    }),
  }));

  return sections.sort((a, b) => {
    const aOutros = a.groupName.toLowerCase() === 'outros' ? 1 : 0;
    const bOutros = b.groupName.toLowerCase() === 'outros' ? 1 : 0;
    if (aOutros !== bOutros) return aOutros - bOutros;
    return a.groupName.localeCompare(b.groupName, 'pt-BR');
  });
}

/**
 * Lista opções de correspondência R9 na ordem de especificidade do backend.
 */
export function getAvailableMatchOptions(
  tx: Pick<
    TransactionDetailDto,
    'merchant_cnpj' | 'counterparty_doc' | 'description_norm' | 'description'
  >,
): MatchCriterionOption[] {
  const options: MatchCriterionOption[] = [];

  if (tx.merchant_cnpj?.trim()) {
    options.push({
      matchType: 'cnpj',
      label: 'CNPJ do estabelecimento',
      preview: tx.merchant_cnpj.trim(),
    });
  }

  if (tx.counterparty_doc?.trim()) {
    options.push({
      matchType: 'receiver_doc',
      label: 'CPF/CNPJ do recebedor',
      preview: tx.counterparty_doc.trim(),
    });
  }

  const descPreview = (tx.description_norm || tx.description || '').trim();
  if (descPreview) {
    options.push({
      matchType: 'description_norm',
      label: 'Descrição semelhante',
      preview: descPreview,
    });
  }

  return options;
}

/**
 * Rótulo curto para badges de tipo de regra R9.
 */
export function formatMatchTypeBadge(matchType: RuleMatchType): string {
  switch (matchType) {
    case 'cnpj':
      return 'CNPJ';
    case 'receiver_doc':
      return 'Recebedor';
    case 'description_norm':
      return 'Descrição';
  }
}

/**
 * Calcula limites mínimo e máximo de navegação para o `MonthSwitcher`.
 */
export function computeMonthBounds(
  availableMonths?: string[],
  currentMonth = getCurrentMonthSP(),
): { minMonth?: string; maxMonth: string } {
  const valid = (availableMonths ?? []).filter((m) => MONTH_KEY_REGEX.test(m)).sort();
  if (valid.length === 0) {
    return { maxMonth: currentMonth };
  }
  const minMonth = valid[0];
  const latestAvailable = valid[valid.length - 1];
  const maxMonth = latestAvailable > currentMonth ? latestAvailable : currentMonth;
  return { minMonth, maxMonth };
}

/**
 * Extrai indicação de parcela (ex.: "Parcela 2/6") dos metadados de cartão, se existir.
 */
export function formatCreditInstallmentLabel(
  meta: Record<string, unknown> | null | undefined,
): string | null {
  if (!meta) return null;
  const installment = meta.installmentNumber;
  const total = meta.totalInstallments;
  if (
    typeof installment === 'number' &&
    typeof total === 'number' &&
    Number.isFinite(installment) &&
    Number.isFinite(total) &&
    total > 1
  ) {
    return `Parcela ${installment}/${total}`;
  }
  return null;
}
