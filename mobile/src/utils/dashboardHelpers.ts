import type {
  DashboardCategorySlice,
  DashboardCreditCard,
  DashboardResponse,
  TransactionTypeFilter,
} from '../api/types';
import type { DonutCategorySlice } from '../components';
import { DONUT_PALETTE } from '../theme/tokens';
import { getDatePartsSP } from './format';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface DashboardTransactionRouteParams {
  month?: string;
  type?: TransactionTypeFilter;
  categoryId?: string;
  accountId?: string;
}

/**
 * Monta rota da aba Transações com filtros pré-selecionados via query string.
 */
export function buildTransactionsRoute(params: DashboardTransactionRouteParams): string {
  const pairs: string[] = [];
  if (params.month) pairs.push(`month=${encodeURIComponent(params.month)}`);
  if (params.type && params.type !== 'all') pairs.push(`type=${encodeURIComponent(params.type)}`);
  if (params.categoryId) pairs.push(`categoryId=${encodeURIComponent(params.categoryId)}`);
  if (params.accountId) pairs.push(`accountId=${encodeURIComponent(params.accountId)}`);
  return pairs.length > 0 ? `/(tabs)/transactions?${pairs.join('&')}` : '/(tabs)/transactions';
}

/**
 * Formata uma data ISO ou YYYY-MM-DD para exibição curta dd/MM em America/Sao_Paulo.
 */
export function formatShortDayMonth(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) return '—';
  const clean = isoOrDate.trim();
  if (!clean) return '—';

  const normalized = DATE_ONLY_REGEX.test(clean) ? `${clean}T12:00:00-03:00` : clean;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return '—';

  const { day, month } = getDatePartsSP(parsed);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

/**
 * Converte categorias agregadas do dashboard em fatias do componente `DonutChart`.
 */
export function mapDashboardCategoriesToDonutSlices(
  categories: DashboardCategorySlice[] | undefined,
): DonutCategorySlice[] {
  if (!categories || categories.length === 0) return [];
  return categories
    .filter((slice) => slice.total > 0)
    .map((slice, index) => ({
      id: slice.category_id,
      name: slice.name_pt,
      amount: slice.total,
      percent: slice.percentage,
      color: slice.color || DONUT_PALETTE[index % DONUT_PALETTE.length],
    }));
}

/**
 * Resolve a lista de cartões de crédito ativos do payload do dashboard.
 */
export function resolveCreditCards(
  dashboard: DashboardResponse | undefined,
): DashboardCreditCard[] {
  if (!dashboard) return [];
  if (Array.isArray(dashboard.credit_cards) && dashboard.credit_cards.length > 0) {
    return dashboard.credit_cards;
  }
  return dashboard.credit_card ? [dashboard.credit_card] : [];
}

/**
 * Formata o título amigável do cartão (ex.: "GOLD" -> "Cartão Inter Gold").
 */
export function formatCreditCardTitle(card: DashboardCreditCard): string {
  const clean = card.name?.trim();
  if (!clean) return 'Cartão Inter Gold';
  if (/^gold$/i.test(clean)) return 'Cartão Inter Gold';
  return clean;
}

/**
 * Formata subtítulo técnico (nível e bandeira) do cartão de crédito.
 */
export function formatCreditCardMeta(card: DashboardCreditCard): string {
  const parts = [card.level, card.brand]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map((v) => v.trim().toUpperCase());
  return parts.length > 0 ? parts.join(' · ') : 'Cartão de crédito';
}

/**
 * Calcula percentual de limite utilizado com segurança para barra visual do cartão.
 */
export function computeCreditLimitUsage(card: DashboardCreditCard): {
  usedRatio: number;
  usedPercent: number;
  hasLimit: boolean;
} {
  if (!Number.isFinite(card.credit_limit) || card.credit_limit <= 0) {
    return { usedRatio: 0, usedPercent: 0, hasLimit: false };
  }

  const usedAmount =
    Number.isFinite(card.available_credit_limit) &&
    card.available_credit_limit >= 0 &&
    card.credit_limit >= card.available_credit_limit
      ? card.credit_limit - card.available_credit_limit
      : Math.max(0, Math.abs(card.invoice_balance));

  const usedRatio = Math.min(1, Math.max(0, usedAmount / card.credit_limit));
  return {
    usedRatio,
    usedPercent: Math.round(usedRatio * 100),
    hasLimit: true,
  };
}

/**
 * Indica se o consentimento Open Finance expirou ou vencerá dentro da janela configurada.
 */
export function isConsentExpiringSoon(
  consentExpiresAt: string | null | undefined,
  now = new Date(),
  thresholdDays = 14,
): boolean {
  if (!consentExpiresAt) return false;
  const parsed = new Date(consentExpiresAt);
  if (Number.isNaN(parsed.getTime())) return false;
  const diffDays = (parsed.getTime() - now.getTime()) / 86_400_000;
  return diffDays <= thresholdDays;
}
