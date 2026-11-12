/**
 * Tipos dos payloads retornados e enviados pela Edge Function `/api` (schema `finance`).
 */

export interface AppSettingsDto {
  exclude_own_transfers?: boolean;
  exclude_investments?: boolean;
  [key: string]: unknown;
}

export interface DashboardCreditCard {
  id: string;
  name: string;
  level: string | null;
  brand: string | null;
  invoice_balance: number;
  credit_limit: number;
  available_credit_limit: number;
  minimum_payment: number;
  balance_close_date: string | null;
  balance_due_date: string | null;
  status: string;
}

export interface DashboardCategorySlice {
  category_id: string;
  name_pt: string;
  color: string;
  total: number;
  tx_count: number;
  percentage: number;
}

export interface DashboardResponse {
  month: string;
  checking_balance: number;
  credit_card: DashboardCreditCard | null;
  credit_cards: DashboardCreditCard[];
  last_synced_at: string | null;
  item_status: string | null;
  consent_expires_at: string | null;
  income_total: number;
  expense_total: number;
  net_total: number;
  pending_count: number;
  pending_expense_total: number;
  excluded_count: number;
  categories: DashboardCategorySlice[];
  available_months: string[];
  settings: AppSettingsDto;
}

export type TransactionTypeFilter = 'all' | 'income' | 'expense' | 'excluded';
export type TransactionStatus = 'POSTED' | 'PENDING';
export type RuleMatchType = 'cnpj' | 'receiver_doc' | 'description_norm';

export interface TransactionDto {
  id: string;
  account_id: string;
  account_name: string;
  account_type: 'BANK' | 'CREDIT';
  account_subtype: string | null;
  occurred_at: string;
  occurred_date_sp: string;
  month_sp: string;
  description: string;
  description_raw: string | null;
  amount_raw: number;
  amount_norm: number;
  pluggy_type: 'DEBIT' | 'CREDIT';
  operation_type: string | null;
  status: TransactionStatus;
  is_pending: boolean;
  kind: string | null;
  paired_tx_id: string | null;
  pluggy_category_id: string | null;
  rule_category_id: string | null;
  manual_category_id: string | null;
  effective_category_id: string;
  category_name_pt: string;
  category_group_id: string;
  category_group_name_pt: string;
  category_group_color: string;
  effective_excluded: boolean;
  manual_excluded: boolean | null;
  counterparty_name: string | null;
  counterparty_doc: string | null;
  merchant_name: string | null;
  merchant_cnpj: string | null;
  credit_card_metadata: Record<string, unknown> | null;
}

export interface TransactionDetailDto extends TransactionDto {
  description_norm: string;
  payment_data: Record<string, unknown> | null;
  merchant_data: Record<string, unknown> | null;
  updated_at: string;
}

export interface TransactionsQuery {
  month?: string;
  type?: TransactionTypeFilter;
  accountId?: string;
  categoryId?: string;
  q?: string;
  includeExcluded?: boolean;
  limit?: number;
  offset?: number;
}

export interface TransactionsResponse {
  results: TransactionDto[];
  limit: number;
  offset: number;
}

export interface PatchTransactionInput {
  categoryId?: string | null;
  excluded?: boolean | null;
  applyToSimilar?: boolean;
  matchType?: RuleMatchType;
}

export interface PatchTransactionResponse {
  transaction: TransactionDto;
  ruleCreated: { id: string; matchType: RuleMatchType; matchValue: string } | null;
  affectedSimilarCount: number;
}

export interface CategoryDto {
  id: string;
  description: string;
  description_pt: string;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  group_id: string;
  group_name_pt: string;
  group_color: string | null;
  depth: number;
}

export interface CategoriesResponse {
  results: CategoryDto[];
}

export interface RuleDto {
  id: string;
  match_type: RuleMatchType;
  match_value: string;
  category_id: string;
  priority: number;
  label: string | null;
  active: boolean;
  created_at: string;
  category_name_pt: string;
}

export interface RulesResponse {
  results: RuleDto[];
}

export interface CreateRuleInput {
  matchType: RuleMatchType;
  matchValue: string;
  categoryId: string;
  label?: string;
}

export interface CreateRuleResponse {
  id: string;
  affectedCount: number;
}

export interface PluggyItemDto {
  id: string;
  connector_id: number | null;
  connector_name: string | null;
  connector_color: string | null;
  status: string;
  execution_status: string | null;
  error_code: string | null;
  error_message: string | null;
  consent_expires_at: string | null;
  last_updated_at: string | null;
  last_synced_at: string | null;
  next_auto_sync_at: string | null;
}

export interface AccountDto {
  id: string;
  item_id: string;
  type: 'BANK' | 'CREDIT';
  subtype: string | null;
  name: string;
  marketing_name: string | null;
  number_masked: string | null;
  balance: number;
  currency_code: string;
  credit_data: Record<string, unknown> | null;
  updated_at: string;
}

export interface SyncRunDto {
  id: string;
  item_id: string;
  trigger: 'manual' | 'pull_to_refresh' | 'webhook' | 'cron';
  status: 'running' | 'success' | 'error';
  fetched_count: number | null;
  upserted_count: number | null;
  paired_count: number | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface ItemsResponse {
  items: PluggyItemDto[];
  accounts: AccountDto[];
  syncRuns: SyncRunDto[];
}

export interface SyncResultDto {
  itemId: string;
  syncRunId: string;
  accountsSynced: number;
  categoriesSynced: number;
  fetchedCount: number;
  upsertedCount: number;
  pairedCount: number;
  lastSyncedAt: string;
}

export interface RegisterItemInput {
  itemId: string;
  sync?: boolean;
  dateFrom?: string;
}

export interface RegisterItemResponse {
  registered: boolean;
  itemId?: string;
  sync?: SyncResultDto;
}

export interface SyncInput {
  itemId?: string;
  refresh?: boolean;
  fullSync?: boolean;
  dateFrom?: string;
  trigger?: 'manual' | 'pull_to_refresh' | 'webhook' | 'cron';
}

export interface SyncResponse {
  ok: boolean;
  sync: SyncResultDto;
}

export interface SettingsResponse {
  settings: AppSettingsDto;
}

export interface UpdateSettingsInput {
  exclude_own_transfers?: boolean;
  exclude_investments?: boolean;
}

export interface ConnectTokenInput {
  itemId?: string;
  clientUserId?: string;
  webhookUrl?: string;
}

export interface ConnectTokenResponse {
  accessToken: string;
}
