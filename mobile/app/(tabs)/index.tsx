import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Clock,
  CreditCard,
  EyeOff,
  Landmark,
  Link2,
  Sparkles,
} from 'lucide-react-native';
import { getApiErrorMessage } from '../../src/api/client';
import type { DashboardCreditCard } from '../../src/api/types';
import {
  AmountText,
  DonutChart,
  GlassBackground,
  GlassCard,
  MonthSwitcher,
  NeonButton,
  SkeletonCard,
  SkeletonRow,
  StatusPill,
} from '../../src/components';
import { useDashboard, useSyncMutation } from '../../src/hooks';
import { COLORS, GLASS_METRICS, SPACING, TAB_BAR_CLEARANCE, TYPOGRAPHY } from '../../src/theme/tokens';
import { mapItemStatus } from '../../src/utils/connectionHelpers';
import {
  buildTransactionsRoute,
  computeCreditLimitUsage,
  formatCreditCardMeta,
  formatCreditCardTitle,
  formatShortDayMonth,
  isConsentExpiringSoon,
  mapDashboardCategoriesToDonutSlices,
  resolveCreditCards,
  type DashboardTransactionRouteParams,
} from '../../src/utils/dashboardHelpers';
import { formatBRL, formatSyncRelative, getCurrentMonthSP } from '../../src/utils/format';
import { computeMonthBounds } from '../../src/utils/transactionHelpers';

interface CreditCardPanelProps {
  card: DashboardCreditCard;
  isPrimary: boolean;
  index: number;
  onPress: () => void;
}

function CreditCardPanel({ card, isPrimary, index, onPress }: CreditCardPanelProps) {
  const usage = computeCreditLimitUsage(card);
  const closeDateLabel = card.balance_close_date
    ? formatShortDayMonth(card.balance_close_date)
    : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Abrir transações de ${formatCreditCardTitle(card)}`}
      testID={isPrimary ? 'dashboard-credit-card' : `dashboard-credit-card-${index}`}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <GlassCard variant="card" tone="purple" padding={SPACING.lg} contentStyle={styles.cardStack}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardTitleGroup}>
            <View style={styles.goldIconWrap}>
              <CreditCard size={18} color={COLORS.semantic.warning} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {formatCreditCardTitle(card)}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {formatCreditCardMeta(card)}
              </Text>
            </View>
          </View>
          <Text style={styles.inlineLink}>Fatura ›</Text>
        </View>

        <View style={styles.cardMetricsRow}>
          <View style={styles.cardMetricCol}>
            <Text style={styles.metricLabel}>Fatura</Text>
            <Text
              style={[styles.metricValue, styles.metricExpense]}
              numberOfLines={1}
              testID={isPrimary ? 'dashboard-card-invoice' : undefined}
            >
              {formatBRL(card.invoice_balance, { absolute: true })}
            </Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.cardMetricCol}>
            <Text style={styles.metricLabel}>Limite disp.</Text>
            <Text
              style={styles.metricValue}
              numberOfLines={1}
              testID={isPrimary ? 'dashboard-card-available-limit' : undefined}
            >
              {formatBRL(card.available_credit_limit, { absolute: true })}
            </Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.cardMetricColEnd}>
            <Text style={styles.metricLabel}>Vence</Text>
            <Text
              style={styles.metricValue}
              numberOfLines={1}
              testID={isPrimary ? 'dashboard-card-due-date' : undefined}
            >
              {formatShortDayMonth(card.balance_due_date)}
            </Text>
          </View>
        </View>

        {usage.hasLimit ? (
          <View style={styles.limitWrap}>
            <View style={styles.limitTrack}>
              <View style={[styles.limitFill, { width: `${usage.usedPercent}%` }]} />
            </View>
            <View style={styles.limitCaptionRow}>
              <Text style={styles.limitCaption}>
                {`Uso ${usage.usedPercent}% de ${formatBRL(card.credit_limit, { absolute: true })}`}
              </Text>
              {closeDateLabel && closeDateLabel !== '—' ? (
                <Text style={styles.limitCaption}>{`Fecha ${closeDateLabel}`}</Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </GlassCard>
    </Pressable>
  );
}

/**
 * Painel financeiro completo (Fase 8): saldo, fluxo mensal, Cartão Inter Gold e gastos por categoria.
 */
export default function DashboardScreen() {
  const router = useRouter();
  const [month, setMonth] = useState(() => getCurrentMonthSP());
  const [categorySelection, setCategorySelection] = useState<{
    month: string;
    categoryId: string | null;
  }>(() => ({ month: getCurrentMonthSP(), categoryId: null }));
  const [syncNotice, setSyncNotice] = useState<{ text: string; tone: 'mint' | 'error' } | null>(null);

  const dashboardQuery = useDashboard(month);
  const syncMutation = useSyncMutation();

  const data = dashboardQuery.data;
  const itemPill = mapItemStatus(data?.item_status);
  const selectedCategoryId =
    categorySelection.month === month ? categorySelection.categoryId : null;

  const monthBounds = useMemo(
    () => computeMonthBounds(data?.available_months, month),
    [data?.available_months, month],
  );

  const slices = useMemo(
    () => mapDashboardCategoriesToDonutSlices(data?.categories),
    [data?.categories],
  );

  const cards = useMemo(() => resolveCreditCards(data), [data]);

  const activeSlice = useMemo(
    () => (selectedCategoryId ? slices.find((s) => s.id === selectedCategoryId) ?? null : null),
    [selectedCategoryId, slices],
  );

  const consentExpiring = isConsentExpiringSoon(data?.consent_expires_at);
  const needsReconnect =
    itemPill.variant === 'error' || itemPill.variant === 'warning' || consentExpiring;

  const statusPillLabel =
    itemPill.variant === 'error' || itemPill.variant === 'warning'
      ? itemPill.label
      : data?.last_synced_at
        ? formatSyncRelative(data.last_synced_at)
        : itemPill.label;

  const statusPillVariant =
    itemPill.variant === 'error' || itemPill.variant === 'warning'
      ? itemPill.variant
      : data?.last_synced_at
        ? 'success'
        : itemPill.variant;

  const navigateTransactions = (params: DashboardTransactionRouteParams) => {
    router.push(buildTransactionsRoute(params) as Href);
  };

  const handlePullToRefresh = () => {
    setSyncNotice(null);
    if (!data?.last_synced_at && !data?.item_status) {
      void dashboardQuery.refetch();
      return;
    }

    syncMutation.mutate(
      {
        refresh: true,
        fullSync: false,
        trigger: 'pull_to_refresh',
      },
      {
        onSuccess: (res) => {
          setSyncNotice({
            text: `Atualizado: ${res.sync.fetchedCount} lidas · ${res.sync.upsertedCount} salvas`,
            tone: 'mint',
          });
        },
        onError: (err) => {
          setSyncNotice({
            text: getApiErrorMessage(err),
            tone: 'error',
          });
        },
      },
    );
  };

  const isRefreshing =
    syncMutation.isPending || (dashboardQuery.isRefetching && !dashboardQuery.isLoading);

  return (
    <GlassBackground testID="dashboard-screen">
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          testID="dashboard-scroll"
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handlePullToRefresh}
              tintColor={COLORS.neon.cyan}
            />
          }
        >
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.kicker}>Gerenciador de Gastos</Text>
              <Text style={styles.title}>Painel</Text>
            </View>
            <StatusPill
              label={statusPillLabel}
              variant={statusPillVariant}
              testID="dashboard-status-pill"
            />
          </View>

          <MonthSwitcher
            month={month}
            minMonth={monthBounds.minMonth}
            maxMonth={monthBounds.maxMonth}
            onChange={(nextMonth) => {
              setMonth(nextMonth);
              setCategorySelection({ month: nextMonth, categoryId: null });
            }}
            testID="dashboard-month-switcher"
          />

          {syncNotice ? (
            <GlassCard
              variant="row"
              tone={syncNotice.tone === 'mint' ? 'mint' : 'neutral'}
              padding={SPACING.md}
              style={syncNotice.tone === 'error' ? styles.errorBorder : undefined}
              testID="dashboard-sync-notice"
            >
              <Text style={styles.noticeText}>{syncNotice.text}</Text>
            </GlassCard>
          ) : null}

          {needsReconnect ? (
            <GlassCard
              variant="row"
              tone="purple"
              padding={SPACING.md}
              style={styles.warnBorder}
              testID="dashboard-reconnect-banner"
            >
              <View style={styles.reconnectRow}>
                <AlertTriangle size={18} color={COLORS.semantic.warning} />
                <View style={styles.flex1}>
                  <Text style={styles.reconnectTitle}>
                    {itemPill.variant === 'error' || itemPill.variant === 'warning'
                      ? `Conexão Open Finance: ${itemPill.label}`
                      : 'Consentimento Open Finance próximo do vencimento'}
                  </Text>
                  <Text style={styles.reconnectSubtitle}>
                    Renove na aba Conexão para manter as atualizações automáticas.
                  </Text>
                </View>
                <Pressable
                  onPress={() => router.push('/(tabs)/settings')}
                  accessibilityRole="button"
                  testID="dashboard-reconnect-action"
                >
                  <Text style={styles.inlineLink}>Abrir ›</Text>
                </Pressable>
              </View>
            </GlassCard>
          ) : null}

          {dashboardQuery.isLoading && !data ? (
            <View style={styles.stack} testID="dashboard-loading">
              <SkeletonCard />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonCard />
            </View>
          ) : null}

          {dashboardQuery.isError && !data ? (
            <GlassCard
              variant="card"
              tone="neutral"
              style={styles.errorBorder}
              contentStyle={styles.stack}
              testID="dashboard-error-card"
            >
              <Text style={styles.errorTitle}>Não foi possível carregar o painel</Text>
              <Text style={styles.subtitle}>{getApiErrorMessage(dashboardQuery.error)}</Text>
              <NeonButton
                label="Tentar novamente"
                tone="cyan"
                fullWidth
                onPress={() => void dashboardQuery.refetch()}
                testID="dashboard-retry-button"
              />
            </GlassCard>
          ) : null}

          {!dashboardQuery.isLoading && (!dashboardQuery.isError || Boolean(data)) ? (
            <>
              <Pressable
                onPress={() => navigateTransactions({ month })}
                accessibilityRole="button"
                accessibilityLabel="Ver transações do mês em conta"
                testID="dashboard-checking-card"
                style={({ pressed }) => (pressed ? styles.pressed : null)}
              >
                <GlassCard variant="elevated" tone="cyan">
                  <View style={styles.heroHeaderRow}>
                    <View style={styles.heroLabelGroup}>
                      <Landmark size={15} color={COLORS.neon.cyan} />
                      <Text style={styles.cardLabel}>Saldo em Conta Corrente</Text>
                    </View>
                    <Text style={styles.inlineLink}>Extrato ›</Text>
                  </View>

                  <AmountText
                    value={data?.checking_balance ?? 0}
                    tone="neutral"
                    size={TYPOGRAPHY.size.hero}
                    weight="bold"
                    glow
                    style={styles.heroAmount}
                    testID="dashboard-checking-balance"
                  />

                  {data?.last_synced_at ? (
                    <View style={styles.netSummaryRow} testID="dashboard-net-summary">
                      <Text style={styles.netLabel}>Resultado do mês:</Text>
                      <AmountText
                        value={data.net_total}
                        signed
                        size={TYPOGRAPHY.size.caption}
                        weight="semibold"
                        testID="dashboard-net-total"
                      />
                    </View>
                  ) : (
                    <Text style={styles.subtitle}>
                      Conecte seu Banco Inter na aba Conexão para importar as transações reais.
                    </Text>
                  )}
                </GlassCard>
              </Pressable>

              <View style={styles.summaryRow}>
                <Pressable
                  onPress={() => navigateTransactions({ month, type: 'income' })}
                  accessibilityRole="button"
                  accessibilityLabel="Filtrar entradas do mês"
                  testID="dashboard-income-card"
                  style={({ pressed }) => [styles.summaryCol, pressed ? styles.pressed : null]}
                >
                  <GlassCard variant="row" tone="mint" padding={SPACING.md} contentStyle={styles.summaryInner}>
                    <View style={styles.summaryHead}>
                      <View style={[styles.summaryIconCircle, styles.incomeIconBg]}>
                        <ArrowUpRight size={14} color={COLORS.semantic.income} />
                      </View>
                      <Text style={styles.summaryTitle}>Receitas</Text>
                    </View>
                    <AmountText
                      value={data?.income_total ?? 0}
                      signed
                      tone="income"
                      size={TYPOGRAPHY.size.section}
                      weight="bold"
                      testID="dashboard-income-total"
                    />
                    <Text style={styles.summaryHint}>Entradas do mês</Text>
                  </GlassCard>
                </Pressable>

                <Pressable
                  onPress={() => navigateTransactions({ month, type: 'expense' })}
                  accessibilityRole="button"
                  accessibilityLabel="Filtrar saídas do mês"
                  testID="dashboard-expense-card"
                  style={({ pressed }) => [styles.summaryCol, pressed ? styles.pressed : null]}
                >
                  <GlassCard
                    variant="row"
                    tintColor="rgba(251, 113, 133, 0.09)"
                    padding={SPACING.md}
                    contentStyle={styles.summaryInner}
                  >
                    <View style={styles.summaryHead}>
                      <View style={[styles.summaryIconCircle, styles.expenseIconBg]}>
                        <ArrowDownRight size={14} color={COLORS.semantic.expense} />
                      </View>
                      <Text style={styles.summaryTitle}>Despesas</Text>
                    </View>
                    <AmountText
                      value={-Math.abs(data?.expense_total ?? 0)}
                      signed
                      tone="expense"
                      size={TYPOGRAPHY.size.section}
                      weight="bold"
                      testID="dashboard-expense-total"
                    />
                    <Text style={styles.summaryHint}>Saídas líquidas</Text>
                  </GlassCard>
                </Pressable>
              </View>

              {(data?.pending_count ?? 0) > 0 || (data?.excluded_count ?? 0) > 0 ? (
                <View style={styles.badgesRow}>
                  {(data?.pending_count ?? 0) > 0 ? (
                    <Pressable
                      onPress={() => navigateTransactions({ month, type: 'expense' })}
                      accessibilityRole="button"
                      testID="dashboard-pending-pill"
                      style={({ pressed }) => [styles.infoChip, pressed ? styles.pressed : null]}
                    >
                      <Clock size={12} color={COLORS.semantic.warning} />
                      <Text style={styles.infoChipText}>
                        {`${data?.pending_count} pendente(s) · ${formatBRL(data?.pending_expense_total ?? 0, { absolute: true })}`}
                      </Text>
                    </Pressable>
                  ) : null}

                  {(data?.excluded_count ?? 0) > 0 ? (
                    <Pressable
                      onPress={() => navigateTransactions({ month, type: 'excluded' })}
                      accessibilityRole="button"
                      testID="dashboard-excluded-pill"
                      style={({ pressed }) => [styles.infoChip, pressed ? styles.pressed : null]}
                    >
                      <EyeOff size={12} color={COLORS.text.secondary} />
                      <Text style={styles.infoChipText}>
                        {`${data?.excluded_count} ignorada(s)`}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {cards.map((card, index) => (
                <CreditCardPanel
                  key={card.id}
                  card={card}
                  isPrimary={index === 0}
                  index={index}
                  onPress={() => navigateTransactions({ month, accountId: card.id })}
                />
              ))}

              <GlassCard
                variant="card"
                tone="neutral"
                contentStyle={styles.cardStack}
                testID="dashboard-donut-card"
              >
                <View style={styles.cardHeaderRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.cardTitle}>Gastos por Categoria</Text>
                    <Text style={styles.cardMeta}>
                      {slices.length > 0
                        ? `${slices.length} ${slices.length === 1 ? 'grupo' : 'grupos'} · toque para filtrar`
                        : 'Sem despesas contabilizadas neste mês'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => navigateTransactions({ month, type: 'expense' })}
                    accessibilityRole="button"
                    testID="dashboard-donut-see-all"
                  >
                    <Text style={styles.inlineLink}>Ver todas ›</Text>
                  </Pressable>
                </View>

                <DonutChart
                  slices={slices}
                  totalExpense={data?.expense_total ?? 0}
                  selectedCategoryId={selectedCategoryId}
                  onSelectCategory={(catId) =>
                    setCategorySelection({ month, categoryId: catId })
                  }
                  testID="dashboard-donut-chart"
                />

                {activeSlice ? (
                  <NeonButton
                    label={`Filtrar ${activeSlice.name} no extrato`}
                    tone="cyan"
                    fullWidth
                    icon={<ArrowUpRight size={16} color={COLORS.neon.cyan} />}
                    onPress={() =>
                      navigateTransactions({
                        month,
                        categoryId: activeSlice.id,
                        type: 'expense',
                      })
                    }
                    testID="dashboard-donut-go-transactions"
                  />
                ) : null}
              </GlassCard>
            </>
          ) : null}

          <View style={styles.actionsStack}>
            <NeonButton
              label="Ver Extrato Completo"
              tone="purple"
              fullWidth
              icon={<ArrowLeftRight size={18} color={COLORS.neon.purple} />}
              onPress={() => navigateTransactions({ month })}
              testID="dashboard-view-transactions-btn"
            />

            <NeonButton
              label="Gerenciar Conexão & Sync"
              tone="cyan"
              fullWidth
              icon={<Link2 size={18} color={COLORS.neon.cyan} />}
              onPress={() => router.push('/(tabs)/settings')}
              testID="dashboard-connection-btn"
            />

            {__DEV__ ? (
              <NeonButton
                label="Abrir Playground Liquid Glass"
                tone="neutral"
                fullWidth
                icon={<Sparkles size={18} color={COLORS.neon.purple} />}
                onPress={() => router.push('/playground' as Href)}
              />
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: TAB_BAR_CLEARANCE,
    gap: SPACING.md + 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  kicker: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  title: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.bold,
    fontSize: TYPOGRAPHY.size.title,
  },
  stack: {
    gap: SPACING.md,
  },
  flex1: {
    flex: 1,
  },
  pressed: {
    opacity: 0.86,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  heroLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardLabel: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  heroAmount: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  netSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
  },
  netLabel: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.caption,
  },
  subtitle: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.body,
    lineHeight: TYPOGRAPHY.lineHeight.body,
  },
  inlineLink: {
    color: COLORS.neon.cyan,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.caption,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  summaryCol: {
    flex: 1,
  },
  summaryInner: {
    gap: 6,
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomeIconBg: {
    backgroundColor: 'rgba(52, 211, 153, 0.16)',
  },
  expenseIconBg: {
    backgroundColor: 'rgba(251, 113, 133, 0.16)',
  },
  summaryTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.caption,
  },
  summaryHint: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: GLASS_METRICS.radius.pill,
    backgroundColor: COLORS.glass.fillSubtle,
    borderWidth: 1,
    borderColor: COLORS.glass.strokeEnd,
  },
  infoChipText: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.micro,
    fontVariant: ['tabular-nums'],
  },
  cardStack: {
    gap: SPACING.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  cardTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  goldIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(251, 191, 36, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.section,
  },
  cardMeta: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
  },
  cardMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  cardMetricCol: {
    flex: 1,
    gap: 2,
  },
  cardMetricColEnd: {
    minWidth: 56,
    alignItems: 'flex-end',
    gap: 2,
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  metricLabel: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
  },
  metricValue: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.body,
    fontVariant: ['tabular-nums'],
  },
  metricExpense: {
    color: COLORS.semantic.expense,
  },
  limitWrap: {
    gap: 6,
  },
  limitTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  limitFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: COLORS.neon.purple,
  },
  limitCaptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  limitCaption: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
    fontVariant: ['tabular-nums'],
  },
  noticeText: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  reconnectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  reconnectTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.caption,
  },
  reconnectSubtitle: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
  },
  warnBorder: {
    borderColor: 'rgba(251, 191, 36, 0.40)',
  },
  errorBorder: {
    borderColor: 'rgba(251, 113, 133, 0.45)',
  },
  errorTitle: {
    color: COLORS.semantic.error,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.section,
  },
  actionsStack: {
    gap: SPACING.sm + 2,
    marginTop: SPACING.xs,
  },
});
