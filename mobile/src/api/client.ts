import type {
  CategoriesResponse,
  ConnectTokenInput,
  ConnectTokenResponse,
  CreateRuleInput,
  CreateRuleResponse,
  DashboardResponse,
  ItemsResponse,
  PatchTransactionInput,
  PatchTransactionResponse,
  RegisterItemInput,
  RegisterItemResponse,
  RulesResponse,
  SettingsResponse,
  SyncInput,
  SyncResponse,
  TransactionDetailDto,
  TransactionsQuery,
  TransactionsResponse,
  UpdateSettingsInput,
} from './types';

/**
 * Erro HTTP estruturado retornado pela Edge Function `/api`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Extrai mensagem legível de erros lançados pela API ou rede.
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Falha inesperada na comunicação com o servidor.',
): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export interface ApiClientConfig {
  baseUrl?: string;
  appKey?: string;
  fetchFn?: typeof fetch;
}

function resolveEnvConfig(): { baseUrl: string; appKey: string } {
  return {
    baseUrl: (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, ''),
    appKey: (process.env.EXPO_PUBLIC_APP_KEY ?? '').trim(),
  };
}

function buildQueryString(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return '';
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

/**
 * Cria instância configurável do cliente REST para comunicação com o backend Supabase.
 */
export function createApiClient(config?: ApiClientConfig) {
  const fetchImpl = config?.fetchFn ?? fetch;

  async function request<T>(
    path: string,
    init?: { method?: string; body?: unknown; requireAuth?: boolean },
  ): Promise<T> {
    const env = resolveEnvConfig();
    const baseUrl = (config?.baseUrl ?? env.baseUrl).trim().replace(/\/+$/, '');
    const appKey = (config?.appKey ?? env.appKey).trim();
    const requireAuth = init?.requireAuth ?? true;

    if (!baseUrl) {
      throw new ApiError(0, 'missing_api_url', 'EXPO_PUBLIC_API_URL não configurada.');
    }
    if (requireAuth && !appKey) {
      throw new ApiError(0, 'missing_app_key', 'EXPO_PUBLIC_APP_KEY não configurada.');
    }

    const headers: Record<string, string> = {};
    if (requireAuth) {
      headers['x-app-key'] = appKey;
    }
    if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const response = await fetchImpl(`${baseUrl}${normalizedPath}`, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    const rawText = await response.text();
    let payload: Record<string, unknown> | null = null;
    if (rawText) {
      try {
        payload = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const code =
        typeof payload?.error === 'string' ? payload.error : `http_${response.status}`;
      const message =
        typeof payload?.message === 'string'
          ? payload.message
          : `Erro na API (${response.status})`;
      throw new ApiError(response.status, code, message, payload ?? rawText);
    }

    return (payload ?? {}) as T;
  }

  return {
    health: () =>
      request<{ ok: boolean; service: string }>('/health', { requireAuth: false }),

    getDashboard: (month?: string) =>
      request<DashboardResponse>(`/dashboard${buildQueryString({ month })}`),

    getTransactions: (query?: TransactionsQuery) =>
      request<TransactionsResponse>(
        `/transactions${buildQueryString({
          month: query?.month,
          type: query?.type,
          accountId: query?.accountId,
          categoryId: query?.categoryId,
          q: query?.q,
          includeExcluded: query?.includeExcluded,
          limit: query?.limit,
          offset: query?.offset,
        })}`,
      ),

    getTransaction: (id: string) =>
      request<TransactionDetailDto>(`/transactions/${encodeURIComponent(id)}`),

    patchTransaction: (id: string, input: PatchTransactionInput) =>
      request<PatchTransactionResponse>(`/transactions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: input,
      }),

    getCategories: () => request<CategoriesResponse>('/categories'),

    getRules: () => request<RulesResponse>('/rules'),

    createRule: (input: CreateRuleInput) =>
      request<CreateRuleResponse>('/rules', { method: 'POST', body: input }),

    deleteRule: (id: string) =>
      request<{ deleted: boolean; id: string }>(`/rules/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),

    getSettings: () => request<SettingsResponse>('/settings'),

    updateSettings: (input: UpdateSettingsInput) =>
      request<SettingsResponse>('/settings', { method: 'PATCH', body: input }),

    getItems: () => request<ItemsResponse>('/items'),

    registerItem: (input: RegisterItemInput) =>
      request<RegisterItemResponse>('/items/register', { method: 'POST', body: input }),

    sync: (input: SyncInput = {}) =>
      request<SyncResponse>('/sync', { method: 'POST', body: input }),

    createConnectToken: (input: ConnectTokenInput = {}) =>
      request<ConnectTokenResponse>('/connect-token', { method: 'POST', body: input }),
  };
}

export const apiClient = createApiClient();
export type ApiClient = ReturnType<typeof createApiClient>;
