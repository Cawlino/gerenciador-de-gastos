import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Canvas, RoundedRect } from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  FlaskConical,
  Landmark,
  Maximize2,
  Sparkles,
  X,
} from 'lucide-react-native';
import { getApiErrorMessage } from '../../src/api/client';
import type { DashboardCreditCard } from '../../src/api/types';
import {
  AmountText,
  DonutChart,
  GlassBackground,
  GlassCard,
  LiquidPullRefresh,
  LiquidPullScrollView,
  MonthSwitcher,
  NeonButton,
  SkeletonCard,
  SkeletonRow,
  StatusPill,
} from '../../src/components';
import { usePrivacyDemo } from '../../src/context/PrivacyDemoContext';
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
import {
  formatPercent,
  formatPrivacyBRL,
  formatSyncRelative,
  getCurrentMonthSP,
} from '../../src/utils/format';
import { computeMonthBounds } from '../../src/utils/transactionHelpers';

interface CreditCardPanelProps {
  card: DashboardCreditCard;
  isPrimary: boolean;
  index: number;
  isPrivacyHidden: boolean;
  onOpenCard: (cardId: string) => void;
}

const CreditCardPanel = React.memo(function CreditCardPanel({
  card,
  isPrimary,
  index,
  isPrivacyHidden,
  onOpenCard,
}: CreditCardPanelProps) {
  const usage = computeCreditLimitUsage(card);
  const closeDateLabel = card.balance_close_date
    ? formatShortDayMonth(card.balance_close_date)
    : null;
  const handlePress = useCallback(() => {
    onOpenCard(card.id);
  }, [card.id, onOpenCard]);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Abrir transações de ${formatCreditCardTitle(card)}`}
      testID={isPrimary ? 'dashboard-credit-card' : `dashboard-credit-card-${index}`}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <GlassCard variant="card" tone="neutral" interactive padding={SPACING.lg} contentStyle={styles.cardStack}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardTitleGroup}>
            <View style={styles.goldIconWrap}>
              <CreditCard size={16} color={COLORS.accent.ice} />
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
          <View style={styles.cardActionPill}>
            <Text style={styles.inlineLink}>Fatura ›</Text>
          </View>
        </View>

        <View style={styles.cardBalanceHeroRow}>
          <View style={styles.cardHeroMetric}>
            <Text style={styles.metricLabel}>Fatura atual</Text>
            <Text
              style={[styles.cardHeroInvoiceValue, styles.metricExpense]}
              numberOfLines={1}
              testID={isPrimary ? 'dashboard-card-invoice' : undefined}
            >
              {formatPrivacyBRL(card.invoice_balance, isPrivacyHidden, { absolute: true })}
            </Text>
          </View>

          <View style={styles.duePill}>
            <Text style={styles.duePillLabel}>Vence</Text>
            <Text
              style={styles.duePillValue}
              numberOfLines={1}
              testID={isPrimary ? 'dashboard-card-due-date' : undefined}
            >
              {formatShortDayMonth(card.balance_due_date)}
            </Text>
          </View>
        </View>

        <View style={styles.cardHairline} />

        <View style={styles.limitWrap}>
          <View style={styles.limitHeaderRow}>
            <Text style={styles.metricLabel}>Limite disponível</Text>
            <Text
              style={styles.limitAvailableValue}
              numberOfLines={1}
              testID={isPrimary ? 'dashboard-card-available-limit' : undefined}
            >
              {formatPrivacyBRL(card.available_credit_limit, isPrivacyHidden, { absolute: true })}
            </Text>
          </View>

          {usage.hasLimit ? (
            <>
              <View style={styles.limitTrack}>
                <LinearGradient
                  colors={['#38BDF8', '#7DD3FC']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[
                    styles.limitFill,
                    usage.usedPercent > 0
                      ? { width: `${Math.max(usage.usedPercent, 4)}%`, minWidth: 12 }
                      : { width: '0%' },
                  ]}
                />
              </View>
              <View style={styles.limitCaptionRow}>
                <Text style={styles.limitCaption}>
                  {`Uso ${usage.usedPercent}% de ${formatPrivacyBRL(card.credit_limit, isPrivacyHidden, { absolute: true })}`}
                </Text>
                {closeDateLabel && closeDateLabel !== '—' ? (
                  <Text style={styles.limitCaption}>{`Fecha ${closeDateLabel}`}</Text>
                ) : null}
              </View>
            </>
          ) : null}
        </View>
      </GlassCard>
    </Pressable>
  );
});

const MINI_SPARK_BARS = [
  { h: 12, color: 'rgba(56, 189, 248, 0.65)' },
  { h: 19, color: 'rgba(52, 211, 153, 0.85)' },
  { h: 15, color: 'rgba(168, 85, 247, 0.80)' },
  { h: 24, color: '#38BDF8' },
  { h: 18, color: 'rgba(251, 113, 133, 0.82)' },
  { h: 28, color: '#34D399' },
] as const;

interface AnalyticsExpandCardProps {
  incomeTotal: number;
  expenseTotal: number;
  onPress: () => void;
}

const AnalyticsExpandCard = React.memo(function AnalyticsExpandCard({
  incomeTotal,
  expenseTotal,
  onPress,
}: AnalyticsExpandCardProps) {
  const reducedMotion = useReducedMotion();
  const pressScale = useSharedValue(1);

  const savingsPct =
    incomeTotal > 0 ? Math.round(((incomeTotal - expenseTotal) / incomeTotal) * 1000) / 10 : 0;

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.get() }],
  }));

  const handlePressIn = useCallback(() => {
    if (reducedMotion) return;
    pressScale.set(withSpring(0.975, { damping: 18, stiffness: 320 }));
  }, [pressScale, reducedMotion]);

  const handlePressOut = useCallback(() => {
    if (reducedMotion) return;
    pressScale.set(withSpring(1, { damping: 15, stiffness: 260 }));
  }, [pressScale, reducedMotion]);

  const handlePress = useCallback(() => {
    void Haptics.selectionAsync().catch(() => undefined);
    onPress();
  }, [onPress]);

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel="Expandir central de análises, gráficos e KPIs"
        testID="dashboard-open-analytics-btn"
      >
        <GlassCard variant="elevated" tone="cyan" interactive contentStyle={styles.analyticsCtaInner}>
          <View style={styles.analyticsCtaTop}>
            <View style={styles.analyticsCtaBadge}>
              <BarChart3 size={13} color={COLORS.accent.ice} />
              <Text style={styles.analyticsCtaBadgeText}>7 VISÕES · 12 MESES</Text>
            </View>
            <View style={styles.analyticsExpandPill}>
              <Text style={styles.inlineLink}>Expandir</Text>
              <Maximize2 size={13} color={COLORS.accent.ice} />
            </View>
          </View>

          <View style={styles.analyticsCtaBody}>
            <View style={styles.analyticsCtaTextCol}>
              <Text style={styles.analyticsCtaTitle}>Análises, Comparativos & KPIs</Text>
              <Text style={styles.analyticsCtaSub}>
                Evolução em conta, ritmo diário, fluxo de caixa, categorias e hábitos
              </Text>
            </View>

            <Canvas style={styles.analyticsMiniCanvas}>
              {MINI_SPARK_BARS.map((bar, idx) => (
                <RoundedRect
                  key={idx}
                  x={idx * 10}
                  y={30 - bar.h}
                  width={6}
                  height={bar.h}
                  r={3}
                  color={bar.color}
                />
              ))}
            </Canvas>
          </View>

          <View style={styles.analyticsCtaFooter}>
            <Text style={styles.analyticsMetricPill}>
              {`Poupança do mês: ${formatPercent(savingsPct, 1)}`}
            </Text>
            <Text style={styles.analyticsMetricPill}>Saldo · Ganhos · Gastos</Text>
          </View>
        </GlassCard>
      </Pressable>
    </Animated.View>
  );
});

/**
 * Painel financeiro completo (Fase 8): saldo, fluxo mensal, Cartão Inter Gold e gastos por categoria.
 */
export default function DashboardScreen() {
  const router = useRouter();
  const { isPrivacyHidden, isDemoMode, setDemoMode, togglePrivacy, toggleDemoMode } = usePrivacyDemo();
  const [month, setMonth] = useState(() => getCurrentMonthSP());
  const [categorySelection, setCategorySelection] = useState<{
    month: string;
    categoryId: string | null;
  }>(() => ({ month: getCurrentMonthSP(), categoryId: null }));
  const [syncNotice, setSyncNotice] = useState<{ text: string; tone: 'mint' | 'error' } | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const dashboardQuery = useDashboard(month);
  const syncMutation = useSyncMutation();
  const localScrollY = useSharedValue(0);

  useEffect(() => {
    if (!syncNotice) return undefined;
    const timer = setTimeout(() => setSyncNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [syncNotice]);

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

  const navigateTransactions = useCallback(
    (params: DashboardTransactionRouteParams) => {
      router.push(buildTransactionsRoute(params) as Href);
    },
    [router],
  );

  const handleMonthChange = useCallback((nextMonth: string) => {
    setMonth(nextMonth);
    setCategorySelection({ month: nextMonth, categoryId: null });
  }, []);

  const handleSelectCategory = useCallback(
    (catId: string | null) => {
      setCategorySelection({ month, categoryId: catId });
    },
    [month],
  );

  const handleOpenCardTransactions = useCallback(
    (cardId: string) => {
      navigateTransactions({ month, accountId: cardId });
    },
    [month, navigateTransactions],
  );

  const handleOpenDonutSeeAll = useCallback(() => {
    navigateTransactions({ month, type: 'expense' });
  }, [month, navigateTransactions]);

  const handleOpenFilteredDonut = useCallback(() => {
    if (!activeSlice) return;
    navigateTransactions({
      month,
      categoryId: activeSlice.id,
      type: 'expense',
    });
  }, [activeSlice, month, navigateTransactions]);

  const handlePullToRefresh = useCallback(() => {
    setSyncNotice(null);
    if (!data?.last_synced_at && !data?.item_status) {
      setManualRefreshing(true);
      void dashboardQuery.refetch().finally(() => {
        setManualRefreshing(false);
      });
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
  }, [dashboardQuery, data?.item_status, data?.last_synced_at, syncMutation]);

  const isRefreshing = syncMutation.isPending || manualRefreshing;

  const compactPillLabel = isDemoMode
    ? 'Demo 12M'
    : statusPillVariant === 'success'
      ? 'Online'
      : statusPillVariant === 'warning' || consentExpiring
        ? 'Expirando'
        : itemPill.label;

  const resolvedPillVariant = isDemoMode ? 'info' : statusPillVariant;

  const handleOpenAnalytics = useCallback(() => {
    router.push(`/analytics?month=${encodeURIComponent(month)}` as Href);
  }, [month, router]);

  const screenTouchStartRef = useRef<{ x: number; y: number; ts: number } | null>(null);
  const donutInteractTsRef = useRef(0);

  return (
    <GlassBackground testID="dashboard-screen">
      <SafeAreaView
        style={styles.safe}
        edges={['top']}
        onTouchStart={(e) => {
          if (selectedCategoryId) {
            screenTouchStartRef.current = {
              x: e.nativeEvent.pageX,
              y: e.nativeEvent.pageY,
              ts: Date.now(),
            };
          } else {
            screenTouchStartRef.current = null;
          }
        }}
        onTouchEnd={(e) => {
          const start = screenTouchStartRef.current;
          screenTouchStartRef.current = null;
          if (!selectedCategoryId || !start) return;
          if (Date.now() - donutInteractTsRef.current < 450) return;
          const dx = e.nativeEvent.pageX - start.x;
          const dy = e.nativeEvent.pageY - start.y;
          if (Date.now() - start.ts < 450 && Math.hypot(dx, dy) < 10) {
            setCategorySelection({ month, categoryId: null });
          }
        }}
        onTouchCancel={() => {
          screenTouchStartRef.current = null;
        }}
      >
        <LiquidPullRefresh
          refreshing={isRefreshing}
          onRefresh={handlePullToRefresh}
          scrollYSV={localScrollY}
          testID="dashboard-pull-refresh"
        >
          {(pullBind) => (
            <LiquidPullScrollView
              pullBind={pullBind}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              testID="dashboard-scroll"
            >
          <View style={styles.headerRow}>
            <View style={styles.headerBrandCol}>
              <View style={styles.kickerRow}>
                <View style={styles.kickerDot} />
                <Text style={styles.brandKicker} numberOfLines={1}>
                  GERENCIADOR DE GASTOS
                </Text>
              </View>
              <Text
                style={styles.brandTitle}
                numberOfLines={1}
                testID="dashboard-header-title"
              >
                Painel
              </Text>
            </View>
            <View style={styles.headerRightControls}>
              <Pressable
                onPress={toggleDemoMode}
                accessibilityRole="button"
                accessibilityLabel={
                  isDemoMode ? 'Desativar dados fictícios' : 'Ativar dados fictícios de 12 meses'
                }
                accessibilityState={{ selected: isDemoMode }}
                hitSlop={6}
                testID="dashboard-demo-toggle-btn"
                style={({ pressed }) => [
                  styles.headerIconBtn,
                  isDemoMode ? styles.headerIconBtnDemoActive : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <FlaskConical
                  size={15}
                  color={isDemoMode ? COLORS.accent.ice : COLORS.text.secondary}
                />
              </Pressable>

              <Pressable
                onPress={togglePrivacy}
                accessibilityRole="button"
                accessibilityLabel={
                  isPrivacyHidden ? 'Mostrar valores monetários' : 'Ocultar valores monetários'
                }
                accessibilityState={{ selected: isPrivacyHidden }}
                hitSlop={6}
                testID="dashboard-privacy-toggle-btn"
                style={({ pressed }) => [
                  styles.headerIconBtn,
                  isPrivacyHidden ? styles.headerIconBtnPrivacyActive : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                {isPrivacyHidden ? (
                  <EyeOff size={15} color={COLORS.neon.purple} />
                ) : (
                  <Eye size={15} color={COLORS.text.secondary} />
                )}
              </Pressable>

              <Pressable
                onPress={() => router.push('/(tabs)/settings')}
                accessibilityRole="button"
                accessibilityLabel={`Status: ${isDemoMode ? 'Modo demonstração 12 meses' : statusPillLabel}. Abrir Conexão`}
                hitSlop={8}
                testID="dashboard-status-pill-btn"
                style={({ pressed }) => [styles.statusBtnWrap, pressed ? styles.pressed : null]}
              >
                <StatusPill
                  label={compactPillLabel}
                  variant={resolvedPillVariant}
                  style={styles.compactStatusPill}
                  testID="dashboard-status-pill"
                />
              </Pressable>
            </View>
          </View>

          <MonthSwitcher
            month={month}
            minMonth={monthBounds.minMonth}
            maxMonth={monthBounds.maxMonth}
            onChange={handleMonthChange}
            testID="dashboard-month-switcher"
          />

          {syncNotice ? (
            <GlassCard
              variant="row"
              tone="neutral"
              padding={SPACING.md}
              style={syncNotice.tone === 'error' ? styles.errorBorder : styles.noticeSuccessBorder}
              contentStyle={styles.noticeRow}
              testID="dashboard-sync-notice"
            >
              <Text style={[styles.noticeText, styles.flex1]}>{syncNotice.text}</Text>
              <Pressable
                onPress={() => setSyncNotice(null)}
                accessibilityRole="button"
                accessibilityLabel="Fechar aviso"
                hitSlop={8}
              >
                <X size={15} color={COLORS.text.secondary} />
              </Pressable>
            </GlassCard>
          ) : null}

          {needsReconnect ? (
            <GlassCard
              variant="row"
              tone="neutral"
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
                  hitSlop={10}
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
              {!isDemoMode ? (
                <NeonButton
                  label="Explorar em Modo Demo (12 meses)"
                  tone="purple"
                  fullWidth
                  icon={<FlaskConical size={16} color={COLORS.orb.purpleSolid} />}
                  onPress={() => setDemoMode(true)}
                  testID="dashboard-fallback-demo-button"
                />
              ) : null}
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
                <GlassCard variant="elevated" tone="neutral" interactive>
                  <View style={styles.heroHeaderRow}>
                    <View style={styles.heroLabelGroup}>
                      <Landmark size={15} color={COLORS.accent.ice} />
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
                  <GlassCard
                    variant="row"
                    tone="neutral"
                    interactive
                    padding={SPACING.md}
                    contentStyle={styles.summaryInner}
                  >
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
                    tone="neutral"
                    interactive
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
                        {`${data?.pending_count} pendente(s) · ${formatPrivacyBRL(data?.pending_expense_total ?? 0, isPrivacyHidden, { absolute: true })}`}
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
                  isPrivacyHidden={isPrivacyHidden}
                  onOpenCard={handleOpenCardTransactions}
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
                    onPress={handleOpenDonutSeeAll}
                    accessibilityRole="button"
                    hitSlop={10}
                    testID="dashboard-donut-see-all"
                  >
                    <Text style={styles.inlineLink}>Ver todas ›</Text>
                  </Pressable>
                </View>

                <View
                  style={styles.cardStack}
                  onTouchStart={() => {
                    donutInteractTsRef.current = Date.now();
                  }}
                >
                  <DonutChart
                    slices={slices}
                    totalExpense={data?.expense_total ?? 0}
                    selectedCategoryId={selectedCategoryId}
                    onSelectCategory={handleSelectCategory}
                    testID="dashboard-donut-chart"
                  />

                  {activeSlice ? (
                    <NeonButton
                      label={`Filtrar ${activeSlice.name} no extrato`}
                      tone="cyan"
                      fullWidth
                      icon={<ArrowUpRight size={16} color={COLORS.accent.ice} />}
                      onPress={handleOpenFilteredDonut}
                      testID="dashboard-donut-go-transactions"
                    />
                  ) : null}
                </View>
              </GlassCard>

              <AnalyticsExpandCard
                incomeTotal={data?.income_total ?? 0}
                expenseTotal={data?.expense_total ?? 0}
                onPress={handleOpenAnalytics}
              />
            </>
          ) : null}

          {__DEV__ ? (
            <View style={styles.actionsStack}>
              <NeonButton
                label="Abrir Playground Liquid Glass"
                tone="neutral"
                fullWidth
                icon={<Sparkles size={18} color={COLORS.accent.ice} />}
                onPress={() => router.push('/playground' as Href)}
              />
            </View>
          ) : null}
            </LiquidPullScrollView>
          )}
        </LiquidPullRefresh>
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
    paddingTop: SPACING.xs,
    paddingBottom: 2,
  },
  headerBrandCol: {
    flex: 1,
    gap: 2,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kickerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent.ice,
  },
  brandKicker: {
    color: '#7DD3FC',
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.35,
  },
  brandTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.display,
    fontSize: 25,
    lineHeight: 29,
    letterSpacing: -0.6,
  },
  statusBtnWrap: {
    flexShrink: 0,
  },
  headerRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
    paddingHorizontal: 5,
    paddingVertical: 4,
    borderRadius: GLASS_METRICS.radius.pill,
    backgroundColor: 'rgba(8, 20, 44, 0.56)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.11)',
  },
  headerIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  headerIconBtnDemoActive: {
    backgroundColor: COLORS.accent.iceTint,
    borderColor: COLORS.accent.iceBorder,
  },
  headerIconBtnPrivacyActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  compactStatusPill: {
    paddingHorizontal: SPACING.sm + 1,
    paddingVertical: 4,
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
    color: COLORS.accent.ice,
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
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(125, 211, 252, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActionPill: {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(56, 189, 248, 0.10)',
  },
  cardTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: 15,
  },
  cardMeta: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: 11.5,
  },
  cardBalanceHeroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  cardHeroMetric: {
    gap: 2,
  },
  cardHeroInvoiceValue: {
    fontFamily: TYPOGRAPHY.family.bold,
    fontSize: 21,
    lineHeight: 26,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  duePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  duePillLabel: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: 11.5,
  },
  duePillValue: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  cardHairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  limitHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  limitAvailableValue: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.caption,
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
  },
  metricExpense: {
    color: COLORS.semantic.expense,
  },
  limitWrap: {
    gap: 7,
  },
  limitTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    overflow: 'hidden',
  },
  limitFill: {
    height: '100%',
    borderRadius: 999,
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
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  noticeSuccessBorder: {
    borderColor: 'rgba(52, 211, 153, 0.32)',
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
  analyticsCtaInner: {
    gap: SPACING.sm + 2,
  },
  analyticsCtaTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  analyticsCtaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(56, 189, 248, 0.32)',
  },
  analyticsCtaBadgeText: {
    color: COLORS.accent.ice,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  analyticsExpandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  analyticsCtaBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  analyticsCtaTextCol: {
    flex: 1,
    gap: 3,
  },
  analyticsCtaTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.bold,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  analyticsCtaSub: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  analyticsMiniCanvas: {
    width: 60,
    height: 30,
  },
  analyticsCtaFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  analyticsMetricPill: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.micro,
    paddingTop: 4,
  },
});
