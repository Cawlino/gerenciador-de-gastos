import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  type ScrollViewProps,
  SectionList,
  type SectionListRenderItemInfo,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CreditCard,
  FlaskConical,
  Landmark,
  Receipt,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from 'lucide-react-native';
import { getApiErrorMessage } from '../../src/api/client';
import type { TransactionDto, TransactionTypeFilter } from '../../src/api/types';
import {
  CategoryPickerModal,
  GlassBackground,
  GlassCard,
  LiquidPullRefresh,
  type LiquidPullRefreshBind,
  LiquidPullScrollView,
  MonthSwitcher,
  NeonButton,
  SkeletonRow,
  TransactionRow,
} from '../../src/components';
import { usePrivacyDemo } from '../../src/context/PrivacyDemoContext';
import {
  useCategories,
  useDashboard,
  useItems,
  useRules,
  useSyncMutation,
  useTransactions,
} from '../../src/hooks';
import { useMotion } from '../../src/theme/MotionContext';
import { COLORS, GLASS_METRICS, SPACING, TAB_BAR_CLEARANCE, TYPOGRAPHY } from '../../src/theme/tokens';
import { getCurrentMonthSP } from '../../src/utils/format';
import {
  computeMonthBounds,
  formatAccountShortLabel,
  groupTransactionsByDay,
  mapTransactionToRowItem,
  type TransactionDaySection,
} from '../../src/utils/transactionHelpers';

const TYPE_OPTIONS: { key: TransactionTypeFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'income', label: 'Entradas' },
  { key: 'expense', label: 'Saídas' },
  { key: 'excluded', label: 'Ignoradas' },
];

const DEFAULT_PAGE_LIMIT = 200;

function isValidMonthKey(value?: string): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

function isValidTypeFilter(value?: string): value is TransactionTypeFilter {
  return value === 'all' || value === 'income' || value === 'expense' || value === 'excluded';
}

interface MemoTransactionListItemProps {
  tx: TransactionDto;
  onOpenDetail: (id: string) => void;
}

const MemoTransactionListItem = React.memo(function MemoTransactionListItem({
  tx,
  onOpenDetail,
}: MemoTransactionListItemProps) {
  const rowItem = useMemo(() => mapTransactionToRowItem(tx), [tx]);
  const handlePress = useCallback(() => {
    onOpenDetail(tx.id);
  }, [onOpenDetail, tx.id]);

  return (
    <TransactionRow
      item={rowItem}
      onPress={handlePress}
      style={styles.rowGap}
      testID={`tx-row-${tx.id}`}
    />
  );
});

interface TransactionsSectionListProps {
  pullBind: LiquidPullRefreshBind;
  sections: TransactionDaySection[];
  rowsLength: number;
  limit: number;
  hasActiveFilters: boolean;
  onOpenDetail: (id: string) => void;
  onResetFilters: () => void;
  onLoadMore: () => void;
}

const TransactionsSectionList = React.memo(function TransactionsSectionList({
  pullBind,
  sections,
  rowsLength,
  limit,
  hasActiveFilters,
  onOpenDetail,
  onResetFilters,
  onLoadMore,
}: TransactionsSectionListProps) {
  const keyExtractor = useCallback((item: TransactionDto) => item.id, []);

  const renderScrollComponent = useCallback(
    (scrollProps: ScrollViewProps) => (
      <LiquidPullScrollView {...scrollProps} pullBind={pullBind} />
    ),
    [pullBind],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: TransactionDaySection }) => (
      <View style={styles.dayHeader} testID={`tx-day-${section.dateKey}`}>
        <Text style={styles.dayTitle}>{section.title}</Text>
        <Text style={styles.dayCount}>
          {section.count === 1 ? '1 lançamento' : `${section.count} lançamentos`}
        </Text>
      </View>
    ),
    [],
  );

  const renderItem = useCallback(
    ({ item }: SectionListRenderItemInfo<TransactionDto, TransactionDaySection>) => (
      <MemoTransactionListItem tx={item} onOpenDetail={onOpenDetail} />
    ),
    [onOpenDetail],
  );

  const listEmpty = useMemo(
    () => (
      <GlassCard testID="transactions-empty" contentStyle={styles.stateCard}>
        <Receipt size={28} color={COLORS.text.secondary} />
        <Text style={styles.stateTitle}>Nenhuma transação encontrada</Text>
        <Text style={styles.stateBody}>
          {hasActiveFilters
            ? 'Nenhum lançamento corresponde aos filtros atuais neste mês.'
            : 'Não há lançamentos registrados para este mês.'}
        </Text>
        {hasActiveFilters ? (
          <NeonButton
            label="Limpar filtros"
            tone="cyan"
            size="md"
            onPress={onResetFilters}
            testID="tx-clear-filters-btn"
          />
        ) : null}
      </GlassCard>
    ),
    [hasActiveFilters, onResetFilters],
  );

  const listFooter = useMemo(
    () =>
      rowsLength >= limit ? (
        <View style={styles.footerLoadMore}>
          <NeonButton
            label="Carregar mais transações"
            tone="neutral"
            size="md"
            onPress={onLoadMore}
            testID="tx-load-more-btn"
          />
        </View>
      ) : undefined,
    [limit, onLoadMore, rowsLength],
  );

  return (
    <SectionList<TransactionDto, TransactionDaySection>
      sections={sections}
      keyExtractor={keyExtractor}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={64}
      initialNumToRender={14}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={40}
      windowSize={7}
      removeClippedSubviews={Platform.OS === 'android'}
      contentContainerStyle={styles.listContent}
      renderScrollComponent={renderScrollComponent}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
      ListEmptyComponent={listEmpty}
      ListFooterComponent={listFooter}
    />
  );
});

/**
 * Tela de Transações (Fase 7): extrato unificado agrupado por dia, filtros, busca e recategorização R9.
 */
export default function TransactionsScreen() {
  const router = useRouter();
  const { isDemoMode, setDemoMode } = usePrivacyDemo();
  const params = useLocalSearchParams<{
    month?: string;
    categoryId?: string;
    type?: string;
    accountId?: string;
  }>();

  const paramMonth = isValidMonthKey(params.month) ? params.month : undefined;
  const paramType = isValidTypeFilter(params.type) ? params.type : undefined;
  const paramCategory =
    typeof params.categoryId === 'string' && params.categoryId ? params.categoryId : undefined;
  const paramAccountId =
    typeof params.accountId === 'string' && params.accountId ? params.accountId : undefined;
  const routeKey = `${paramMonth ?? ''}|${paramType ?? ''}|${paramCategory ?? ''}|${paramAccountId ?? ''}`;

  const [filterState, setFilterState] = useState(() => ({
    routeKey,
    month: paramMonth ?? getCurrentMonthSP(),
    typeFilter: paramType ?? ('all' as TransactionTypeFilter),
    categoryId: paramCategory,
    accountId: paramAccountId,
  }));

  const month = filterState.routeKey === routeKey ? filterState.month : (paramMonth ?? getCurrentMonthSP());
  const typeFilter = filterState.routeKey === routeKey ? filterState.typeFilter : (paramType ?? 'all');
  const categoryId = filterState.routeKey === routeKey ? filterState.categoryId : paramCategory;
  const accountId = filterState.routeKey === routeKey ? filterState.accountId : paramAccountId;

  const [searchText, setSearchText] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [limit, setLimit] = useState(DEFAULT_PAGE_LIMIT);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const isSearchVisible = searchExpanded || searchText.length > 0;

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const updateFilters = useCallback(
    (patch: {
      month?: string;
      typeFilter?: TransactionTypeFilter;
      categoryId?: string | undefined;
      accountId?: string | undefined;
    }) => {
      setFilterState({
        routeKey,
        month: patch.month ?? month,
        typeFilter: patch.typeFilter ?? typeFilter,
        categoryId: 'categoryId' in patch ? patch.categoryId : categoryId,
        accountId: 'accountId' in patch ? patch.accountId : accountId,
      });
    },
    [accountId, categoryId, month, routeKey, typeFilter],
  );

  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      setDebouncedQuery('');
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      setDebouncedQuery(trimmed);
      searchTimerRef.current = null;
    }, 220);
  }, []);

  const handleClearSearch = useCallback(() => {
    handleSearchChange('');
  }, [handleSearchChange]);

  const dashboardQuery = useDashboard(month);
  const itemsQuery = useItems();
  const categoriesQuery = useCategories();
  const rulesQuery = useRules();
  const syncMutation = useSyncMutation();

  const transactionsQuery = useTransactions({
    month,
    type: typeFilter,
    accountId,
    categoryId,
    q: debouncedQuery || undefined,
    includeExcluded: true,
    limit,
    offset: 0,
  });

  const monthBounds = useMemo(
    () => computeMonthBounds(dashboardQuery.data?.available_months, month),
    [dashboardQuery.data?.available_months, month],
  );

  const accounts = useMemo(() => itemsQuery.data?.accounts ?? [], [itemsQuery.data?.accounts]);
  const categories = useMemo(
    () => categoriesQuery.data?.results ?? [],
    [categoriesQuery.data?.results],
  );
  const rulesCount = rulesQuery.data?.results.length ?? 0;

  const selectedCategoryLabel = useMemo(() => {
    if (!categoryId) return null;
    const match = categories.find((c) => c.id === categoryId);
    if (match) return match.description_pt;
    const groupMatch = categories.find((c) => c.group_id === categoryId);
    return groupMatch?.group_name_pt ?? 'Categoria filtrada';
  }, [categories, categoryId]);

  const rows = useMemo(
    () => transactionsQuery.data?.results ?? [],
    [transactionsQuery.data?.results],
  );

  const sections = useMemo<TransactionDaySection[]>(
    () => groupTransactionsByDay(rows),
    [rows],
  );

  const hasActiveFilters = Boolean(
    typeFilter !== 'all' || accountId || categoryId || debouncedQuery || searchText.trim(),
  );

  const handleResetFilters = useCallback(() => {
    updateFilters({ typeFilter: 'all', categoryId: undefined, accountId: undefined });
    handleClearSearch();
    setSearchExpanded(false);
    setLimit(DEFAULT_PAGE_LIMIT);
  }, [handleClearSearch, updateFilters]);

  const handleToggleSearch = useCallback(() => {
    void Haptics.selectionAsync().catch(() => undefined);
    if (isSearchVisible) {
      handleClearSearch();
      setSearchExpanded(false);
      return;
    }
    setSearchExpanded(true);
  }, [handleClearSearch, isSearchVisible]);

  const handleMonthChange = useCallback(
    (nextMonth: string) => {
      updateFilters({ month: nextMonth });
      setLimit(DEFAULT_PAGE_LIMIT);
    },
    [updateFilters],
  );

  const handlePullToRefresh = useCallback(() => {
    setSyncMessage(null);
    const primaryItem = itemsQuery.data?.items[0];
    if (!primaryItem) {
      setManualRefreshing(true);
      void transactionsQuery.refetch().finally(() => {
        setManualRefreshing(false);
      });
      return;
    }

    syncMutation.mutate(
      {
        itemId: primaryItem.id,
        refresh: true,
        fullSync: false,
        trigger: 'pull_to_refresh',
      },
      {
        onSuccess: (res) => {
          setSyncMessage(
            `Atualizado: ${res.sync.fetchedCount} lidas · ${res.sync.upsertedCount} salvas`,
          );
        },
        onError: (err) => {
          setSyncMessage(getApiErrorMessage(err));
        },
      },
    );
  }, [itemsQuery.data?.items, syncMutation, transactionsQuery]);

  const handleOpenDetail = useCallback(
    (txId: string) => {
      router.push(`/transaction/${encodeURIComponent(txId)}` as Href);
    },
    [router],
  );

  const handleLoadMore = useCallback(() => {
    setLimit((prev) => prev + 100);
  }, []);

  const handleSelectCategoryFilter = useCallback(
    (selected: string | null) => {
      updateFilters({ categoryId: selected ?? undefined });
    },
    [updateFilters],
  );

  const handleCloseCategoryModal = useCallback(() => {
    setCategoryModalOpen(false);
  }, []);

  const localScrollY = useSharedValue(0);
  const motion = useMotion();

  return (
    <GlassBackground testID="transactions-screen">
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topChrome}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Transações</Text>
            <View style={styles.headerActions}>
              <Pressable
                onPress={handleToggleSearch}
                accessibilityRole="button"
                accessibilityLabel={isSearchVisible ? 'Fechar busca' : 'Buscar transações'}
                accessibilityState={{ expanded: isSearchVisible }}
                hitSlop={6}
                testID="tx-search-toggle-btn"
                style={({ pressed }) => [
                  styles.searchToggleBtn,
                  isSearchVisible ? styles.searchToggleBtnActive : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                {isSearchVisible ? (
                  <X size={17} color={COLORS.accent.ice} />
                ) : (
                  <Search size={17} color={COLORS.text.primary} />
                )}
              </Pressable>

              <Pressable
                onPress={() => router.push('/rules' as Href)}
                accessibilityRole="button"
                accessibilityLabel="Gerenciar regras de categorização"
                hitSlop={4}
                testID="tx-rules-btn"
                style={({ pressed }) => [styles.rulesPill, pressed ? styles.pressed : null]}
              >
                <SlidersHorizontal size={14} color={COLORS.accent.ice} />
                <Text style={styles.rulesPillText}>
                  {rulesCount > 0 ? `Regras (${rulesCount})` : 'Regras'}
                </Text>
              </Pressable>
            </View>
          </View>

          <MonthSwitcher
            month={month}
            minMonth={monthBounds.minMonth}
            maxMonth={monthBounds.maxMonth}
            onChange={handleMonthChange}
            testID="transactions-month-switcher"
          />

          <View style={styles.segmentedWrap}>
            {TYPE_OPTIONS.map((option) => {
              const active = typeFilter === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => {
                    void Haptics.selectionAsync().catch(() => undefined);
                    updateFilters({ typeFilter: option.key });
                    setLimit(DEFAULT_PAGE_LIMIT);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  testID={`tx-filter-${option.key}`}
                  style={[styles.segmentBtn, active ? styles.segmentBtnActive : null]}
                >
                  <Text
                    style={[styles.segmentText, active ? styles.segmentTextActive : null]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {isSearchVisible ? (
            <View style={styles.searchBar}>
              <Search size={16} color={COLORS.accent.ice} />
              <TextInput
                value={searchText}
                onChangeText={handleSearchChange}
                placeholder="Buscar descrição, loja ou PIX..."
                placeholderTextColor={COLORS.text.secondary}
                autoCorrect={false}
                autoFocus={searchExpanded}
                returnKeyType="search"
                style={styles.searchInput}
                testID="tx-search-input"
              />
              {searchText ? (
                <Pressable
                  onPress={handleClearSearch}
                  accessibilityRole="button"
                  accessibilityLabel="Limpar busca"
                  testID="tx-search-clear"
                  hitSlop={8}
                >
                  <X size={16} color={COLORS.text.secondary} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <GestureScrollView
            horizontal
            disallowInterruption
            block={motion?.pagerGesture}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync().catch(() => undefined);
                updateFilters({ accountId: undefined });
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: !accountId }}
              testID="tx-account-all"
              style={[styles.chip, !accountId ? styles.chipActive : null]}
            >
              <Text style={[styles.chipText, !accountId ? styles.chipTextActive : null]}>
                Todas contas
              </Text>
            </Pressable>

            {accounts.map((acc) => {
              const active = accountId === acc.id;
              const shortLabel = formatAccountShortLabel(acc.type);
              return (
                <Pressable
                  key={acc.id}
                  onPress={() => {
                    void Haptics.selectionAsync().catch(() => undefined);
                    updateFilters({ accountId: active ? undefined : acc.id });
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  testID={`tx-account-${acc.type}`}
                  style={[styles.chip, active ? styles.chipActive : null]}
                >
                  {acc.type === 'CREDIT' ? (
                    <CreditCard
                      size={13}
                      color={active ? COLORS.accent.ice : COLORS.text.secondary}
                    />
                  ) : (
                    <Landmark
                      size={13}
                      color={active ? COLORS.accent.ice : COLORS.text.secondary}
                    />
                  )}
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                    {shortLabel}
                  </Text>
                </Pressable>
              );
            })}

            <Pressable
              onPress={() => setCategoryModalOpen(true)}
              accessibilityRole="button"
              accessibilityState={{ selected: Boolean(categoryId) }}
              testID="tx-category-filter-btn"
              style={[styles.chip, categoryId ? styles.chipActive : null]}
            >
              <Tag
                size={13}
                color={categoryId ? COLORS.accent.ice : COLORS.text.secondary}
              />
              <Text
                style={[styles.chipText, categoryId ? styles.chipTextActive : null]}
                numberOfLines={1}
              >
                {selectedCategoryLabel ?? 'Categoria'}
              </Text>
            </Pressable>

            {categoryId ? (
              <Pressable
                onPress={() => updateFilters({ categoryId: undefined })}
                accessibilityRole="button"
                accessibilityLabel="Remover filtro de categoria"
                testID="tx-category-filter-clear"
                style={[styles.chip, styles.chipActive]}
              >
                <X size={13} color={COLORS.accent.ice} />
              </Pressable>
            ) : null}
          </GestureScrollView>

          {syncMessage ? (
            <View style={styles.syncNotice} testID="tx-sync-banner">
              <Text style={styles.syncNoticeText}>{syncMessage}</Text>
            </View>
          ) : null}
        </View>

        {transactionsQuery.isLoading ? (
          <View style={styles.skeletonWrap} testID="transactions-loading">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : transactionsQuery.isError ? (
          <View style={styles.stateWrap}>
            <GlassCard tone="neutral" testID="transactions-error" contentStyle={styles.stateCard}>
              <Text style={styles.stateTitle}>Não foi possível carregar o extrato</Text>
              <Text style={styles.stateBody}>
                {getApiErrorMessage(transactionsQuery.error)}
              </Text>
              <NeonButton
                label="Tentar novamente"
                tone="cyan"
                onPress={() => {
                  void transactionsQuery.refetch();
                }}
              />
              {!isDemoMode ? (
                <NeonButton
                  label="Explorar em Modo Demo (12 meses)"
                  tone="purple"
                  icon={<FlaskConical size={16} color={COLORS.orb.purpleSolid} />}
                  onPress={() => setDemoMode(true)}
                  testID="transactions-fallback-demo-button"
                />
              ) : null}
            </GlassCard>
          </View>
        ) : (
          <LiquidPullRefresh
            refreshing={manualRefreshing || syncMutation.isPending}
            onRefresh={handlePullToRefresh}
            scrollYSV={localScrollY}
            testID="transactions-pull-refresh"
          >
            {(pullBind) => (
              <TransactionsSectionList
                pullBind={pullBind}
                sections={sections}
                rowsLength={rows.length}
                limit={limit}
                hasActiveFilters={hasActiveFilters}
                onOpenDetail={handleOpenDetail}
                onResetFilters={handleResetFilters}
                onLoadMore={handleLoadMore}
              />
            )}
          </LiquidPullRefresh>
        )}

        <CategoryPickerModal
          visible={categoryModalOpen}
          title="Filtrar por categoria"
          categories={categories}
          selectedCategoryId={categoryId ?? null}
          allowClear
          onSelect={handleSelectCategoryFilter}
          onClose={handleCloseCategoryModal}
          testID="tx-category-filter-modal"
        />
      </SafeAreaView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  topChrome: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm + 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  searchToggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.glass.fill,
    borderWidth: 1,
    borderColor: COLORS.glass.hairline,
  },
  searchToggleBtnActive: {
    backgroundColor: COLORS.accent.iceTint,
    borderColor: COLORS.accent.iceBorder,
  },
  title: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.display,
    fontSize: 24,
    letterSpacing: -0.5,
  },
  rulesPill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: GLASS_METRICS.radius.pill,
    backgroundColor: COLORS.glass.fill,
    borderWidth: 1,
    borderColor: COLORS.glass.hairline,
  },
  rulesPillText: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  pressed: {
    opacity: 0.8,
  },
  segmentedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glass.fillSubtle,
    borderRadius: GLASS_METRICS.radius.pill,
    borderWidth: 1,
    borderColor: COLORS.glass.hairlineSubtle,
    padding: 3,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xs + 2,
    borderRadius: GLASS_METRICS.radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentBtnActive: {
    backgroundColor: COLORS.glass.activePill,
    borderColor: COLORS.glass.activeStroke,
  },
  segmentText: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  segmentTextActive: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: SPACING.sm,
    backgroundColor: COLORS.glass.fill,
    borderRadius: GLASS_METRICS.radius.pill,
    borderWidth: 1,
    borderColor: COLORS.glass.hairline,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.body,
    paddingVertical: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingRight: SPACING.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: GLASS_METRICS.radius.pill,
    backgroundColor: COLORS.glass.fillSubtle,
    borderWidth: 1,
    borderColor: COLORS.glass.hairlineSubtle,
  },
  chipActive: {
    backgroundColor: COLORS.accent.iceTint,
    borderColor: COLORS.accent.iceBorder,
  },
  chipText: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
    maxWidth: 160,
  },
  chipTextActive: {
    color: COLORS.text.primary,
  },
  syncNotice: {
    backgroundColor: COLORS.accent.iceTint,
    borderRadius: GLASS_METRICS.radius.row - 4,
    borderWidth: 1,
    borderColor: COLORS.accent.iceBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
  },
  syncNoticeText: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  skeletonWrap: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    gap: SPACING.md,
  },
  stateWrap: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  stateCard: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  stateTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.section,
    textAlign: 'center',
  },
  stateBody: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.body,
    textAlign: 'center',
    lineHeight: TYPOGRAPHY.lineHeight.body,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs + 2,
  },
  dayTitle: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.caption,
  },
  dayCount: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
  },
  rowGap: {
    marginBottom: SPACING.sm + 2,
  },
  footerLoadMore: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
});
