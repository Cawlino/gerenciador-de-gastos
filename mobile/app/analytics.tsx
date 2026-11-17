import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Activity,
  ArrowDownUp,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  Flame,
  FlaskConical,
  Landmark,
  PiggyBank,
  Receipt,
  Sparkles,
  Store,
  TrendingUp,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getApiErrorMessage } from '../src/api/client';
import {
  AccountVsCardSplitChart,
  AmountText,
  BalanceAreaChart,
  CashFlowWaterfallChart,
  CategoryComparisonChart,
  GlassBackground,
  GlassCard,
  IncomeExpenseComboChart,
  LiquidPullRefresh,
  LiquidPullScrollView,
  MonthSwitcher,
  NeonButton,
  SkeletonCard,
  SkeletonRow,
  SpendingPaceChart,
  TopMerchantsList,
  WeekdayHeatmapChart,
} from '../src/components';
import { usePrivacyDemo } from '../src/context/PrivacyDemoContext';
import { useAnalyticsData } from '../src/hooks';
import { COLORS, GLASS_METRICS, SPACING, TYPOGRAPHY } from '../src/theme/tokens';
import type { AnalyticsHorizon } from '../src/utils/analyticsHelpers';
import { formatPercent, getCurrentMonthSP } from '../src/utils/format';
import { computeMonthBounds } from '../src/utils/transactionHelpers';

type AnalyticsSectionFilter = 'all' | 'cashflow' | 'pace' | 'categories';

const HORIZONS: AnalyticsHorizon[] = ['3M', '6M', '12M'];

const SECTION_CHIPS: { key: AnalyticsSectionFilter; label: string }[] = [
  { key: 'all', label: 'Visão Geral' },
  { key: 'cashflow', label: 'Conta & Fluxo' },
  { key: 'pace', label: 'Gastos & Ritmo' },
  { key: 'categories', label: 'Categorias & Hábitos' },
];

function isValidMonthKey(value?: string): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

/**
 * Central de Análises, Gráficos Comparativos e KPIs Executivos (Ganhos, Gastos e Dinheiro em Conta).
 */
export default function AnalyticsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ month?: string }>();
  const initialMonth = isValidMonthKey(params.month) ? params.month : getCurrentMonthSP();

  const [month, setMonth] = useState(initialMonth);
  const [horizon, setHorizon] = useState<AnalyticsHorizon>('12M');
  const [section, setSection] = useState<AnalyticsSectionFilter>('all');

  const { isPrivacyHidden, isDemoMode, setDemoMode, togglePrivacy, toggleDemoMode } = usePrivacyDemo();
  const analyticsQuery = useAnalyticsData(month, horizon);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const localScrollY = useSharedValue(0);

  const handlePullToRefresh = useCallback(() => {
    setManualRefreshing(true);
    void analyticsQuery.refetch().finally(() => {
      setManualRefreshing(false);
    });
  }, [analyticsQuery]);

  const reducedMotion = useReducedMotion();
  const enterProgress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      enterProgress.set(1);
      return;
    }
    enterProgress.set(0);
    enterProgress.set(
      withSpring(1, {
        damping: 22,
        stiffness: 220,
        mass: 0.85,
      }),
    );
  }, [enterProgress, reducedMotion]);

  const containerAnimStyle = useAnimatedStyle(() => {
    const p = enterProgress.get();
    return {
      opacity: 0.35 + p * 0.65,
      transform: [{ translateY: (1 - p) * 26 }, { scale: 0.97 + p * 0.03 }],
    };
  });

  const handleClose = useCallback(() => {
    void Haptics.selectionAsync().catch(() => undefined);
    if (reducedMotion) {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
      return;
    }
    enterProgress.set(
      withTiming(0, { duration: 150, easing: Easing.out(Easing.quad) }),
    );
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [enterProgress, reducedMotion, router]);

  const data = analyticsQuery.data;
  const kpis = data?.kpis;

  const monthBounds = useMemo(() => {
    const baseMonths = data?.balanceSeries.map((b) => b.month) ?? [];
    return computeMonthBounds(baseMonths, month);
  }, [data?.balanceSeries, month]);

  const showCashflow = section === 'all' || section === 'cashflow';
  const showPace = section === 'all' || section === 'pace';
  const showCategories = section === 'all' || section === 'categories';

  return (
    <GlassBackground testID="analytics-screen">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Animated.View style={[styles.flex1, containerAnimStyle]}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Recolher análises e voltar ao Painel"
              hitSlop={8}
              testID="analytics-back-btn"
              style={({ pressed }) => [styles.iconBtn, pressed ? styles.pressed : null]}
            >
              <ChevronDown size={20} color={COLORS.text.primary} />
            </Pressable>

            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                Análises & KPIs
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {isDemoMode
                  ? 'Modo demo · 12 meses'
                  : 'Fluxo, ritmo e patrimônio'}
              </Text>
            </View>

            <View style={styles.headerActions}>
              <Pressable
                onPress={toggleDemoMode}
                accessibilityRole="button"
                accessibilityLabel={
                  isDemoMode ? 'Desativar dados fictícios' : 'Ativar dados fictícios de 12 meses'
                }
                accessibilityState={{ selected: isDemoMode }}
                hitSlop={6}
                testID="analytics-demo-toggle-btn"
                style={({ pressed }) => [
                  styles.iconBtn,
                  isDemoMode ? styles.iconBtnDemoActive : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <FlaskConical
                  size={17}
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
                testID="analytics-privacy-toggle-btn"
                style={({ pressed }) => [
                  styles.iconBtn,
                  isPrivacyHidden ? styles.iconBtnPrivacyActive : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                {isPrivacyHidden ? (
                  <EyeOff size={17} color={COLORS.neon.purple} />
                ) : (
                  <Eye size={17} color={COLORS.text.secondary} />
                )}
              </Pressable>
            </View>
          </View>

          <LiquidPullRefresh
            refreshing={manualRefreshing}
            onRefresh={handlePullToRefresh}
            scrollYSV={localScrollY}
            testID="analytics-pull-refresh"
          >
            {(pullBind) => (
              <LiquidPullScrollView
                pullBind={pullBind}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                testID="analytics-scroll"
              >
            <MonthSwitcher
              month={month}
              minMonth={monthBounds.minMonth}
              maxMonth={monthBounds.maxMonth}
              onChange={(next) => setMonth(next)}
              testID="analytics-month-switcher"
            />

            <View style={styles.controlsRow}>
              <View style={styles.horizonGroup} testID="analytics-horizon-selector">
                {HORIZONS.map((h) => {
                  const active = horizon === h;
                  return (
                    <Pressable
                      key={h}
                      onPress={() => {
                        void Haptics.selectionAsync().catch(() => undefined);
                        setHorizon(h);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      testID={`analytics-horizon-${h}`}
                      style={[styles.horizonBtn, active ? styles.horizonBtnActive : null]}
                    >
                      <Text
                        style={[styles.horizonText, active ? styles.horizonTextActive : null]}
                      >
                        {h}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.periodBadge}>
                <Sparkles size={12} color={COLORS.accent.ice} />
                <Text style={styles.periodBadgeText}>{`Janela ${horizon}`}</Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sectionChipsRow}
            >
              {SECTION_CHIPS.map((chip) => {
                const active = section === chip.key;
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => {
                      void Haptics.selectionAsync().catch(() => undefined);
                      setSection(chip.key);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    testID={`analytics-section-${chip.key}`}
                    style={[styles.sectionChip, active ? styles.sectionChipActive : null]}
                  >
                    <Text
                      style={[styles.sectionChipText, active ? styles.sectionChipTextActive : null]}
                    >
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {analyticsQuery.isLoading && !data ? (
              <View style={styles.stack} testID="analytics-loading">
                <SkeletonCard />
                <SkeletonRow />
                <SkeletonCard />
                <SkeletonCard />
              </View>
            ) : null}

            {analyticsQuery.isError && !data ? (
              <GlassCard
                variant="card"
                tone="neutral"
                contentStyle={styles.stack}
                testID="analytics-error"
              >
                <Text style={styles.errorTitle}>Não foi possível carregar as análises</Text>
                <Text style={styles.cardSub}>{getApiErrorMessage(analyticsQuery.error)}</Text>
                <NeonButton
                  label="Tentar novamente"
                  tone="cyan"
                  onPress={() => void analyticsQuery.refetch()}
                />
                {!isDemoMode ? (
                  <NeonButton
                    label="Explorar em Modo Demo (12 meses)"
                    tone="purple"
                    icon={<FlaskConical size={16} color={COLORS.orb.purpleSolid} />}
                    onPress={() => setDemoMode(true)}
                    testID="analytics-fallback-demo-button"
                  />
                ) : null}
              </GlassCard>
            ) : null}

            {data && kpis ? (
              <>
                {/* Super KPIs Executivos (Grid 2x2 alinhado) */}
                <View style={styles.kpiGrid} testID="analytics-kpi-grid">
                  <View style={styles.kpiRow}>
                    <GlassCard
                      variant="row"
                      tone="cyan"
                      padding={SPACING.md}
                      style={styles.kpiCardWrap}
                      contentStyle={styles.kpiCardInner}
                      testID="kpi-savings-rate"
                    >
                      <View style={styles.kpiTopRow}>
                        <PiggyBank size={15} color={COLORS.semantic.income} />
                        <Text style={styles.kpiLabel}>Taxa de Poupança</Text>
                      </View>
                      <Text style={styles.kpiHeroValue} numberOfLines={1}>
                        {formatPercent(kpis.savingsRatePct, 1)}
                      </Text>
                      <Text
                        style={[
                          styles.kpiHint,
                          kpis.savingsRateDeltaPp >= 0 ? styles.positiveText : styles.negativeText,
                        ]}
                        numberOfLines={1}
                      >
                        {`${kpis.savingsRateDeltaPp >= 0 ? '+' : ''}${formatPercent(kpis.savingsRateDeltaPp, 1)} vs mês ant.`}
                      </Text>
                    </GlassCard>

                    <GlassCard
                      variant="row"
                      tone="purple"
                      padding={SPACING.md}
                      style={styles.kpiCardWrap}
                      contentStyle={styles.kpiCardInner}
                      testID="kpi-burn-rate"
                    >
                      <View style={styles.kpiTopRow}>
                        <Flame size={15} color={COLORS.semantic.warning} />
                        <Text style={styles.kpiLabel}>Burn Rate Diário</Text>
                      </View>
                      <AmountText
                        value={kpis.dailyBurnRate}
                        tone="neutral"
                        size={18}
                        weight="bold"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      />
                      <View style={styles.kpiSubAmountRow}>
                        <Text style={styles.kpiHint}>Projeção: </Text>
                        <AmountText
                          value={kpis.projectedMonthExpense}
                          tone="neutral"
                          size={TYPOGRAPHY.size.micro}
                          weight="medium"
                          style={styles.kpiHintAmount}
                        />
                      </View>
                    </GlassCard>
                  </View>

                  <View style={styles.kpiRow}>
                    <GlassCard
                      variant="row"
                      tone="mint"
                      padding={SPACING.md}
                      style={styles.kpiCardWrap}
                      contentStyle={styles.kpiCardInner}
                      testID="kpi-runway"
                    >
                      <View style={styles.kpiTopRow}>
                        <Clock size={15} color={COLORS.accent.ice} />
                        <Text style={styles.kpiLabel}>Runway em Conta</Text>
                      </View>
                      <Text style={styles.kpiHeroValue} numberOfLines={1}>
                        {`${kpis.cashRunwayMonths.toFixed(1).replace('.', ',')} meses`}
                      </Text>
                      <View style={styles.kpiSubAmountRow}>
                        <Text style={styles.kpiHint}>Média/mês: </Text>
                        <AmountText
                          value={kpis.avgMonthlyExpense}
                          tone="neutral"
                          size={TYPOGRAPHY.size.micro}
                          weight="medium"
                          style={styles.kpiHintAmount}
                        />
                      </View>
                    </GlassCard>

                    <GlassCard
                      variant="row"
                      tone="neutral"
                      padding={SPACING.md}
                      style={styles.kpiCardWrap}
                      contentStyle={styles.kpiCardInner}
                      testID="kpi-net-accumulated"
                    >
                      <View style={styles.kpiTopRow}>
                        <Receipt size={15} color={COLORS.neon.purple} />
                        <Text style={styles.kpiLabel}>{`Sobra ${horizon}`}</Text>
                      </View>
                      <AmountText
                        value={kpis.periodNetTotal}
                        signed
                        tone="auto"
                        size={18}
                        weight="bold"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      />
                      <View style={styles.kpiSubAmountRow}>
                        <Text style={styles.kpiHint}>Ticket médio: </Text>
                        <AmountText
                          value={kpis.averageExpenseTicket}
                          tone="neutral"
                          size={TYPOGRAPHY.size.micro}
                          weight="medium"
                          style={styles.kpiHintAmount}
                        />
                      </View>
                    </GlassCard>
                  </View>
                </View>

                {showCashflow ? (
                  <>
                    <GlassCard
                      variant="card"
                      tone="neutral"
                      contentStyle={styles.stack}
                      testID="card-balance-evolution"
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.cardIconWrap}>
                          <Landmark size={16} color={COLORS.accent.ice} />
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.cardTitle}>Evolução do Dinheiro em Conta</Text>
                          <Text style={styles.cardSub}>
                            Saldo projetado em conta corrente e média móvel 3M
                          </Text>
                        </View>
                      </View>
                      <BalanceAreaChart series={data.balanceSeries} />
                    </GlassCard>

                    <GlassCard
                      variant="card"
                      tone="neutral"
                      contentStyle={styles.stack}
                      testID="card-income-expense-combo"
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.cardIconWrap}>
                          <TrendingUp size={16} color={COLORS.semantic.income} />
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.cardTitle}>Ganhos vs. Gastos & Sobra Líquida</Text>
                          <Text style={styles.cardSub}>
                            Toque em qualquer mês para inspecionar entradas, saídas e poupança
                          </Text>
                        </View>
                      </View>
                      <IncomeExpenseComboChart series={data.incomeExpenseSeries} />
                    </GlassCard>

                    <GlassCard
                      variant="card"
                      tone="neutral"
                      contentStyle={styles.stack}
                      testID="card-waterfall"
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.cardIconWrap}>
                          <ArrowDownUp size={16} color={COLORS.accent.ice} />
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.cardTitle}>Ponte de Fluxo de Caixa (Waterfall)</Text>
                          <Text style={styles.cardSub}>
                            Como seus ganhos do mês viram gastos por grupo e sobra em conta
                          </Text>
                        </View>
                      </View>
                      <CashFlowWaterfallChart steps={data.waterfall} />
                    </GlassCard>
                  </>
                ) : null}

                {showPace ? (
                  <>
                    <GlassCard
                      variant="card"
                      tone="neutral"
                      contentStyle={styles.stack}
                      testID="card-spending-pace"
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.cardIconWrap}>
                          <Activity size={16} color={COLORS.semantic.warning} />
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.cardTitle}>Ritmo Diário de Gastos (Spending Pace)</Text>
                          <Text style={styles.cardSub}>
                            Evolução acumulada dia a dia frente ao mês anterior
                          </Text>
                        </View>
                      </View>
                      <SpendingPaceChart pace={data.spendingPace} />
                    </GlassCard>

                    <GlassCard
                      variant="card"
                      tone="neutral"
                      contentStyle={styles.stack}
                      testID="card-channel-split"
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.cardIconWrap}>
                          <Landmark size={16} color={COLORS.neon.purple} />
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.cardTitle}>Conta Corrente (PIX/Débito) vs. Cartão</Text>
                          <Text style={styles.cardSub}>
                            {`Distribuição dos gastos nos últimos ${horizon}`}
                          </Text>
                        </View>
                      </View>
                      <AccountVsCardSplitChart split={data.habits.channelSplit} />
                    </GlassCard>
                  </>
                ) : null}

                {showCategories ? (
                  <>
                    <GlassCard
                      variant="card"
                      tone="neutral"
                      contentStyle={styles.stack}
                      testID="card-category-comparison"
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.cardIconWrap}>
                          <TrendingUp size={16} color={COLORS.accent.ice} />
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.cardTitle}>Categorias: Mês Atual vs. Média 12M</Text>
                          <Text style={styles.cardSub}>
                            O traço branco marca sua média histórica em cada grupo
                          </Text>
                        </View>
                      </View>
                      <CategoryComparisonChart items={data.categoryComparisons} />
                    </GlassCard>

                    <GlassCard
                      variant="card"
                      tone="neutral"
                      contentStyle={styles.stack}
                      testID="card-weekday-heatmap"
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.cardIconWrap}>
                          <Flame size={16} color={COLORS.accent.ice} />
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.cardTitle}>Mapa de Calor por Dia da Semana</Text>
                          <Text style={styles.cardSub}>
                            Concentração de gastos por dia (toque para ver o total)
                          </Text>
                        </View>
                      </View>
                      <WeekdayHeatmapChart cells={data.habits.weekdayHeatmap} />
                    </GlassCard>

                    <GlassCard
                      variant="card"
                      tone="neutral"
                      contentStyle={styles.stack}
                      testID="card-top-merchants"
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.cardIconWrap}>
                          <Store size={16} color={COLORS.semantic.income} />
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.cardTitle}>Top 5 Estabelecimentos & Recebedores</Text>
                          <Text style={styles.cardSub}>
                            {`Maiores destinos de gasto na janela ${horizon}`}
                          </Text>
                        </View>
                      </View>
                      <TopMerchantsList merchants={data.habits.topMerchants} />
                    </GlassCard>
                  </>
                ) : null}
              </>
            ) : null}
              </LiquidPullScrollView>
            )}
          </LiquidPullRefresh>
        </Animated.View>
      </SafeAreaView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  pressed: {
    opacity: 0.78,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xs + 2,
    paddingBottom: SPACING.sm,
  },
  headerTitleWrap: {
    flex: 1,
    gap: 1,
  },
  headerTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.display,
    fontSize: 21,
    letterSpacing: -0.5,
  },
  headerSub: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.glass.fill,
    borderWidth: 1,
    borderColor: COLORS.glass.hairline,
  },
  iconBtnDemoActive: {
    backgroundColor: COLORS.accent.iceTint,
    borderColor: COLORS.accent.iceBorder,
  },
  iconBtnPrivacyActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xxxl + 16,
    gap: SPACING.md + 2,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  horizonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: GLASS_METRICS.radius.pill,
    backgroundColor: COLORS.glass.fillSubtle,
    borderWidth: 1,
    borderColor: COLORS.glass.hairlineSubtle,
    gap: 3,
  },
  horizonBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: GLASS_METRICS.radius.pill,
  },
  horizonBtnActive: {
    backgroundColor: COLORS.glass.activePill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.glass.activeStroke,
  },
  horizonText: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  horizonTextActive: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
  },
  periodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.sm + 3,
    paddingVertical: 6,
    borderRadius: GLASS_METRICS.radius.pill,
    backgroundColor: COLORS.accent.iceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.accent.iceBorder,
  },
  periodBadgeText: {
    color: COLORS.accent.ice,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.micro,
  },
  sectionChipsRow: {
    gap: SPACING.sm,
    paddingVertical: 2,
  },
  sectionChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: GLASS_METRICS.radius.pill,
    backgroundColor: COLORS.glass.fillSubtle,
    borderWidth: 1,
    borderColor: COLORS.glass.hairlineSubtle,
  },
  sectionChipActive: {
    backgroundColor: COLORS.accent.iceTint,
    borderColor: COLORS.accent.iceBorder,
  },
  sectionChipText: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  sectionChipTextActive: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
  },
  stack: {
    gap: SPACING.md,
  },
  kpiGrid: {
    gap: SPACING.sm + 2,
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.sm + 2,
  },
  kpiCardWrap: {
    flex: 1,
  },
  kpiCardInner: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 6,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kpiLabel: {
    flex: 1,
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.micro,
  },
  kpiHeroValue: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.display,
    fontSize: 20,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  kpiHint: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.micro,
  },
  kpiHintAmount: {
    color: COLORS.text.secondary,
  },
  kpiSubAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  positiveText: {
    color: COLORS.semantic.income,
  },
  negativeText: {
    color: COLORS.semantic.expense,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  cardIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(125, 211, 252, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: 15,
  },
  cardSub: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: 11.5,
    lineHeight: 16,
  },
  errorTitle: {
    color: COLORS.semantic.error,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.section,
  },
});
