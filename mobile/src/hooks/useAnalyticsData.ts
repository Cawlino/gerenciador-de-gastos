import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { apiClient, type ApiClient } from '../api/client';
import type { DashboardResponse } from '../api/types';
import { usePrivacyDemo } from '../context/PrivacyDemoContext';
import {
  buildAnalyticsDataset,
  type AnalyticsDataset,
  type AnalyticsHorizon,
} from '../utils/analyticsHelpers';
import { shiftYearMonth } from '../utils/format';

/**
 * Busca e consolida os últimos 12 meses de dashboards + transações para a Central de Análises & KPIs.
 * Alterna automaticamente entre a API real e a simulação de 12 meses em memória quando `isDemoMode` está ativo.
 */
export function useAnalyticsData(
  selectedMonth: string,
  horizon: AnalyticsHorizon,
  explicitClient?: ApiClient,
): {
  data: AnalyticsDataset | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<void>;
} {
  const queryClient = useQueryClient();
  const { isDemoMode, demoClient } = usePrivacyDemo();
  const client = isDemoMode ? demoClient : (explicitClient ?? apiClient);
  const scope = isDemoMode ? 'finance-demo' : 'finance';

  const months12 = useMemo(
    () => Array.from({ length: 12 }, (_, idx) => shiftYearMonth(selectedMonth, -(11 - idx))),
    [selectedMonth],
  );

  const combinedDash = useQueries({
    queries: months12.map((month) => ({
      queryKey: [scope, 'dashboard', month] as const,
      queryFn: () => client.getDashboard(month),
      staleTime: 1000 * 60 * 5,
    })),
    combine: (results) => {
      const dashboards: DashboardResponse[] = [];
      let isLoadingAny = false;
      let firstError: unknown = null;

      for (const r of results) {
        if (r.data) dashboards.push(r.data);
        if (r.isLoading && !r.data) isLoadingAny = true;
        if (r.isError && !r.data && !firstError) firstError = r.error;
      }

      return {
        dashboards,
        isLoading: isLoadingAny,
        firstError,
      };
    },
  });

  const transactionsQuery = useQuery({
    queryKey: [scope, 'transactions', { analytics: true, limit: 500, includeExcluded: false }] as const,
    queryFn: () => client.getTransactions({ limit: 500, includeExcluded: false }),
    staleTime: 1000 * 60 * 5,
  });

  const isLoading =
    combinedDash.isLoading || (transactionsQuery.isLoading && !transactionsQuery.data);
  const isError = Boolean(
    combinedDash.firstError || (transactionsQuery.isError && !transactionsQuery.data),
  );
  const error = combinedDash.firstError ?? transactionsQuery.error ?? null;

  const transactions = useMemo(
    () => transactionsQuery.data?.results ?? [],
    [transactionsQuery.data?.results],
  );

  const dataset = useMemo<AnalyticsDataset | null>(() => {
    if (combinedDash.isLoading || combinedDash.dashboards.length === 0) return null;
    return buildAnalyticsDataset({
      dashboards12M: combinedDash.dashboards,
      transactions,
      selectedMonth,
      horizon,
    });
  }, [combinedDash.dashboards, combinedDash.isLoading, horizon, selectedMonth, transactions]);

  const refetch = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [scope, 'dashboard'] }),
      transactionsQuery.refetch(),
    ]);
  }, [queryClient, scope, transactionsQuery]);

  return {
    data: dataset,
    isLoading,
    isError,
    error,
    refetch,
  };
}
