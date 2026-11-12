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

/**
 * Consulta o painel mensal consolidado (saldos, totais e categorias).
 */
export function useDashboard(month?: string, client: ApiClient = apiClient) {
  return useQuery({
    queryKey: financeKeys.dashboard(month),
    queryFn: () => client.getDashboard(month),
  });
}

/**
 * Consulta o extrato unificado com filtros por mês, tipo, conta, categoria e busca.
 */
export function useTransactions(query?: TransactionsQuery, client: ApiClient = apiClient) {
  return useQuery({
    queryKey: financeKeys.transactions(query),
    queryFn: () => client.getTransactions(query),
  });
}

/**
 * Consulta detalhes completos de uma transação específica.
 */
export function useTransactionDetail(id: string, client: ApiClient = apiClient) {
  return useQuery({
    queryKey: financeKeys.transaction(id),
    queryFn: () => client.getTransaction(id),
    enabled: Boolean(id),
  });
}

/**
 * Lista a árvore completa de categorias traduzidas (PT-BR).
 */
export function useCategories(client: ApiClient = apiClient) {
  return useQuery({
    queryKey: financeKeys.categories(),
    queryFn: () => client.getCategories(),
    staleTime: 1000 * 60 * 30,
  });
}

/**
 * Lista as regras automáticas de recategorização (R9).
 */
export function useRules(client: ApiClient = apiClient) {
  return useQuery({
    queryKey: financeKeys.rules(),
    queryFn: () => client.getRules(),
  });
}

/**
 * Lista preferências configuráveis do aplicativo (R4/R5).
 */
export function useSettings(client: ApiClient = apiClient) {
  return useQuery({
    queryKey: financeKeys.settings(),
    queryFn: () => client.getSettings(),
  });
}

/**
 * Lista itens conectados na Pluggy, contas e histórico recente de execuções de sync.
 */
export function useItems(client: ApiClient = apiClient) {
  return useQuery({
    queryKey: financeKeys.items(),
    queryFn: () => client.getItems(),
  });
}

/**
 * Dispara sincronização sob demanda (incremental ou 12 meses) e invalida caches relacionados.
 */
export function useSyncMutation(client: ApiClient = apiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SyncInput = {}) => client.sync(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finance', 'items'] }),
        queryClient.invalidateQueries({ queryKey: ['finance', 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['finance', 'categories'] }),
      ]);
    },
  });
}

/**
 * Registra um novo Item ID da Pluggy e opcionalmente executa o 1º sync completo.
 */
export function useRegisterItemMutation(client: ApiClient = apiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterItemInput) => client.registerItem(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finance', 'items'] }),
        queryClient.invalidateQueries({ queryKey: ['finance', 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['finance', 'categories'] }),
      ]);
    },
  });
}

/**
 * Atualiza flags R4/R5 e invalida dashboard/transações para refletir totais recalculados.
 */
export function useUpdateSettingsMutation(client: ApiClient = apiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSettingsInput) => client.updateSettings(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeKeys.settings() }),
        queryClient.invalidateQueries({ queryKey: ['finance', 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] }),
      ]);
    },
  });
}

/**
 * Edita categoria manual/exclusão da transação e propaga regra semelhante (R9).
 */
export function usePatchTransactionMutation(client: ApiClient = apiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchTransactionInput }) =>
      client.patchTransaction(id, input),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeKeys.transaction(variables.id) }),
        queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['finance', 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: financeKeys.rules() }),
      ]);
    },
  });
}

/**
 * Cria regra manual de categorização e aplica em histórico compatível.
 */
export function useCreateRuleMutation(client: ApiClient = apiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRuleInput) => client.createRule(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeKeys.rules() }),
        queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['finance', 'dashboard'] }),
      ]);
    },
  });
}

/**
 * Remove uma regra de categorização.
 */
export function useDeleteRuleMutation(client: ApiClient = apiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.deleteRule(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeKeys.rules() }),
        queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['finance', 'dashboard'] }),
      ]);
    },
  });
}

/**
 * Solicita connectToken temporário para abertura do widget Pluggy Connect (reconexão).
 */
export function useConnectTokenMutation(client: ApiClient = apiClient) {
  return useMutation({
    mutationFn: (input: ConnectTokenInput = {}) => client.createConnectToken(input),
  });
}
