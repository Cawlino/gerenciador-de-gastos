import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type ApiClient } from '../api/client';
import type {
  ConnectTokenInput,
  CreateRuleInput,
  PatchTransactionInput,
  RegisterItemInput,
  SyncInput,
  TransactionsQuery,
  UpdateSettingsInput,
} from '../api/types';
import { usePrivacyDemo } from '../context/PrivacyDemoContext';

export const financeKeys = {
  all: ['finance'] as const,
  dashboard: (month?: string) => ['finance', 'dashboard', month ?? 'current'] as const,
  transactions: (query?: TransactionsQuery) =>
    ['finance', 'transactions', query ?? {}] as const,
  transaction: (id: string) => ['finance', 'transaction', id] as const,
  categories: () => ['finance', 'categories'] as const,
  rules: () => ['finance', 'rules'] as const,
  settings: () => ['finance', 'settings'] as const,
  items: () => ['finance', 'items'] as const,
};

function useResolvedFinanceClient(explicitClient?: ApiClient) {
  const { isDemoMode, demoClient } = usePrivacyDemo();
  if (isDemoMode) {
    return { client: demoClient, scope: 'finance-demo' as const };
  }
  return { client: explicitClient ?? apiClient, scope: 'finance' as const };
}

function scopedKey<T extends readonly unknown[]>(scope: 'finance' | 'finance-demo', key: T) {
  if (scope === 'finance') return key;
  return [scope, ...key.slice(1)] as const;
}

/**
 * Consulta o painel mensal consolidado (saldos, totais e categorias).
 */
export function useDashboard(month?: string, explicitClient?: ApiClient) {
  const { client, scope } = useResolvedFinanceClient(explicitClient);
  return useQuery({
    queryKey: scopedKey(scope, financeKeys.dashboard(month)),
    queryFn: () => client.getDashboard(month),
  });
}

/**
 * Consulta o extrato unificado com filtros por mês, tipo, conta, categoria e busca.
 */
export function useTransactions(query?: TransactionsQuery, explicitClient?: ApiClient) {
  const { client, scope } = useResolvedFinanceClient(explicitClient);
  return useQuery({
    queryKey: scopedKey(scope, financeKeys.transactions(query)),
    queryFn: () => client.getTransactions(query),
  });
}

/**
 * Consulta detalhes completos de uma transação específica.
 */
export function useTransactionDetail(id: string, explicitClient?: ApiClient) {
  const { client, scope } = useResolvedFinanceClient(explicitClient);
  return useQuery({
    queryKey: scopedKey(scope, financeKeys.transaction(id)),
    queryFn: () => client.getTransaction(id),
    enabled: Boolean(id),
  });
}

/**
 * Lista a árvore completa de categorias traduzidas (PT-BR).
 */
export function useCategories(explicitClient?: ApiClient) {
  const { client, scope } = useResolvedFinanceClient(explicitClient);
  return useQuery({
    queryKey: scopedKey(scope, financeKeys.categories()),
    queryFn: () => client.getCategories(),
    staleTime: 1000 * 60 * 30,
  });
}

/**
 * Lista as regras automáticas de recategorização (R9).
 */
export function useRules(explicitClient?: ApiClient) {
  const { client, scope } = useResolvedFinanceClient(explicitClient);
  return useQuery({
    queryKey: scopedKey(scope, financeKeys.rules()),
    queryFn: () => client.getRules(),
  });
}

/**
 * Lista preferências configuráveis do aplicativo (R4/R5).
 */
export function useSettings(explicitClient?: ApiClient) {
  const { client, scope } = useResolvedFinanceClient(explicitClient);
  return useQuery({
    queryKey: scopedKey(scope, financeKeys.settings()),
    queryFn: () => client.getSettings(),
  });
}

/**
 * Lista itens conectados na Pluggy, contas e histórico recente de execuções de sync.
 */
export function useItems(explicitClient?: ApiClient) {
  const { client, scope } = useResolvedFinanceClient(explicitClient);
  return useQuery({
    queryKey: scopedKey(scope, financeKeys.items()),
    queryFn: () => client.getItems(),
  });
}

/**
 * Dispara sincronização sob demanda (incremental ou 12 meses) e invalida caches relacionados.
 */
export function useSyncMutation(explicitClient?: ApiClient) {
  const queryClient = useQueryClient();
  const { client, scope } = useResolvedFinanceClient(explicitClient);
  return useMutation({
    mutationFn: (input: SyncInput = {}) => client.sync(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [scope, 'items'] }),
        queryClient.invalidateQueries({ queryKey: [scope, 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: [scope, 'transactions'] }),
        queryClient.invalidateQueries({ queryKey: [scope, 'categories'] }),
      ]);
    },
  });
}

/**
 * Registra um novo Item ID da Pluggy e opcionalmente executa o 1º sync completo.
 */
export function useRegisterItemMutation(explicitClient?: ApiClient) {
  const queryClient = useQueryClient();
  const { client, scope } = useResolvedFinanceClient(explicitClient);
  return useMutation({
    mutationFn: (input: RegisterItemInput) => client.registerItem(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [scope, 'items'] }),
        queryClient.invalidateQueries({ queryKey: [scope, 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: [scope, 'transactions'] }),
        queryClient.invalidateQueries({ queryKey: [scope, 'categories'] }),
      ]);
    },
  });
}

/**
 * Atualiza flags R4/R5 e invalida dashboard/transações para refletir totais recalculados.
 */
export function useUpdateSettingsMutation(explicitClient?: ApiClient) {
  const queryClient = useQueryClient();
  const { client, scope } = useResolvedFinanceClient(explicitClient);
  return useMutation({
    mutationFn: (input: UpdateSettingsInput) => client.updateSettings(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [scope, 'settings'] }),
        queryClient.invalidateQueries({ queryKey: [scope, 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: [scope, 'transactions'] }),
      ]);
    },
  });
}

/**
 * Edita categoria manual/exclusão da transação e propaga regra semelhante (R9).
 */
export function usePatchTransactionMutation(explicitClient?: ApiClient) {
  const queryClient = useQueryClient();
  const { client, scope } = useResolvedFinanceClient(explicitClient);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchTransactionInput }) =>
      client.patchTransaction(id, input),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [scope, 'transaction', variables.id] }),
        queryClient.invalidateQueries({ queryKey: [scope, 'transactions'] }),
        queryClient.invalidateQueries({ queryKey: [scope, 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: [scope, 'rules'] }),
      ]);
    },
  });
}

/**
 * Cria regra manual de categorização e aplica em histórico compatível.
 */
export function useCreateRuleMutation(explicitClient?: ApiClient) {
  const queryClient = useQueryClient();
  const { client, scope } = useResolvedFinanceClient(explicitClient);
  return useMutation({
    mutationFn: (input: CreateRuleInput) => client.createRule(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [scope, 'rules'] }),
        queryClient.invalidateQueries({ queryKey: [scope, 'transactions'] }),
        queryClient.invalidateQueries({ queryKey: [scope, 'dashboard'] }),
      ]);
    },
  });
}

/**
 * Remove uma regra de categorização.
 */
export function useDeleteRuleMutation(explicitClient?: ApiClient) {
  const queryClient = useQueryClient();
  const { client, scope } = useResolvedFinanceClient(explicitClient);
  return useMutation({
    mutationFn: (id: string) => client.deleteRule(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [scope, 'rules'] }),
        queryClient.invalidateQueries({ queryKey: [scope, 'transactions'] }),
        queryClient.invalidateQueries({ queryKey: [scope, 'dashboard'] }),
      ]);
    },
  });
}

/**
 * Solicita connectToken temporário para abertura do widget Pluggy Connect (reconexão).
 */
export function useConnectTokenMutation(explicitClient?: ApiClient) {
  const { client } = useResolvedFinanceClient(explicitClient);
  return useMutation({
    mutationFn: (input: ConnectTokenInput = {}) => client.createConnectToken(input),
  });
}
