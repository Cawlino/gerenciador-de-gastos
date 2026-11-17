import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Tag,
} from 'lucide-react-native';
import { getApiErrorMessage } from '../../src/api/client';
import type { PatchTransactionInput, RuleMatchType } from '../../src/api/types';
import {
  AmountText,
  CategoryPickerModal,
  GlassBackground,
  GlassCard,
  NeonButton,
  SkeletonCard,
  StatusPill,
} from '../../src/components';
import {
  useCategories,
  usePatchTransactionMutation,
  useTransactionDetail,
} from '../../src/hooks';
import { COLORS, GLASS_METRICS, SPACING, TYPOGRAPHY } from '../../src/theme/tokens';
import { formatDayGroupLabel, formatTimeSP } from '../../src/utils/format';
import {
  formatAccountShortLabel,
  formatCreditInstallmentLabel,
  getAvailableMatchOptions,
  getCategoryOriginLabel,
  getExcludedReasonLabel,
  getTransactionKindLabel,
} from '../../src/utils/transactionHelpers';

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Tela de detalhe da transação com recategorização PT-BR, regra semelhante (R9) e exclusão manual.
 */
export default function TransactionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const txId = typeof params.id === 'string' ? params.id : '';

  const detailQuery = useTransactionDetail(txId);
  const categoriesQuery = useCategories();
  const patchMutation = usePatchTransactionMutation();

  const detail = detailQuery.data;
  const categories = useMemo(
    () => categoriesQuery.data?.results ?? [],
    [categoriesQuery.data?.results],
  );

  const matchOptions = useMemo(
    () => (detail ? getAvailableMatchOptions(detail) : []),
    [detail],
  );

  const revisionKey = detail ? `${detail.id}:${detail.updated_at}` : '';
  const [draft, setDraft] = useState<{
    revisionKey: string;
    categoryId: string | null;
    manualExcluded: boolean | null;
    applyToSimilar: boolean;
    matchType?: RuleMatchType;
  } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );

  const activeDraft = draft && detail && draft.revisionKey === revisionKey ? draft : null;
  const selectedCategoryId = activeDraft
    ? activeDraft.categoryId
    : (detail?.effective_category_id ?? null);
  const manualExcluded = activeDraft ? activeDraft.manualExcluded : (detail?.manual_excluded ?? null);
  const applyToSimilar = activeDraft ? activeDraft.applyToSimilar : false;
  const selectedMatchType = activeDraft?.matchType ?? matchOptions[0]?.matchType;

  const updateDraft = (
    patch: Partial<{
      categoryId: string | null;
      manualExcluded: boolean | null;
      applyToSimilar: boolean;
      matchType?: RuleMatchType;
    }>,
  ) => {
    if (!detail) return;
    setDraft((prev) => {
      const base =
        prev && prev.revisionKey === revisionKey
          ? prev
          : {
              revisionKey,
              categoryId: detail.effective_category_id,
              manualExcluded: detail.manual_excluded,
              applyToSimilar: false,
              matchType: matchOptions[0]?.matchType,
            };
      return { ...base, ...patch };
    });
  };

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );

  const effectiveExcludedPreview = detail
    ? manualExcluded !== null
      ? manualExcluded
      : detail.effective_excluded
    : false;

  const categoryChanged = Boolean(
    detail && selectedCategoryId && selectedCategoryId !== detail.effective_category_id,
  );
  const excludedChanged = Boolean(detail && manualExcluded !== detail.manual_excluded);
  const canSave = Boolean(
    detail &&
      (categoryChanged || excludedChanged || (applyToSimilar && selectedCategoryId)),
  );

  const excludedReason = detail
    ? getExcludedReasonLabel({
        kind: detail.kind,
        manual_excluded: manualExcluded,
        effective_excluded: effectiveExcludedPreview,
      })
    : null;

  const installmentLabel = detail
    ? formatCreditInstallmentLabel(detail.credit_card_metadata)
    : null;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/transactions' as Href);
    }
  };

  const handleSave = () => {
    if (!detail || !canSave) return;
    setFeedback(null);

    const input: PatchTransactionInput = {};
    if ((categoryChanged || applyToSimilar) && selectedCategoryId) {
      input.categoryId = selectedCategoryId;
    }
    if (excludedChanged) {
      input.excluded = manualExcluded;
    }
    if (applyToSimilar && selectedCategoryId) {
      input.applyToSimilar = true;
      if (selectedMatchType) {
        input.matchType = selectedMatchType;
      }
    }

    patchMutation.mutate(
      { id: detail.id, input },
      {
        onSuccess: (res) => {
          updateDraft({ applyToSimilar: false });
          if (res.ruleCreated) {
            setFeedback({
              tone: 'success',
              text: `Salvo! Regra aplicada em ${res.affectedSimilarCount} lançamento(s) semelhante(s).`,
            });
          } else {
            setFeedback({
              tone: 'success',
              text: 'Alterações salvas com sucesso.',
            });
          }
        },
        onError: (err) => {
          setFeedback({
            tone: 'error',
            text: getApiErrorMessage(err),
          });
        },
      },
    );
  };

  return (
    <GlassBackground testID="transaction-detail-screen">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Voltar para transações"
            hitSlop={6}
            testID="tx-detail-back-btn"
            style={styles.backBtn}
          >
            <ArrowLeft size={18} color={COLORS.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Detalhe do lançamento</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {detailQuery.isLoading ? (
            <SkeletonCard testID="tx-detail-loading" />
          ) : detailQuery.isError || !detail ? (
            <GlassCard
              tone="neutral"
              tintColor={COLORS.accent.expenseTint}
              testID="tx-detail-error"
              contentStyle={styles.errorCard}
            >
              <Text style={styles.errorTitle}>Não foi possível carregar o lançamento</Text>
              <Text style={styles.errorBody}>
                {detailQuery.error
                  ? getApiErrorMessage(detailQuery.error)
                  : 'Transação não encontrada.'}
              </Text>
              <NeonButton
                label="Tentar novamente"
                tone="cyan"
                onPress={() => {
                  void detailQuery.refetch();
                }}
              />
            </GlassCard>
          ) : (
            <>
              <GlassCard
                variant="elevated"
                tone="neutral"
                contentStyle={styles.heroCard}
              >
                <View style={styles.badgesRow}>
                  <StatusPill
                    label={getCategoryOriginLabel(detail)}
                    variant="info"
                    showDot={false}
                  />
                  {detail.is_pending ? (
                    <StatusPill label="pendente" variant="warning" showDot={false} />
                  ) : null}
                  {excludedReason ? (
                    <StatusPill label={excludedReason} variant="muted" showDot={false} />
                  ) : null}
                </View>

                <Text style={styles.heroDescription} testID="tx-detail-description">
                  {detail.description}
                </Text>
                <Text style={styles.heroSubtitle}>
                  {`${formatAccountShortLabel(detail.account_type)} · ${formatDayGroupLabel(
                    detail.occurred_at,
                  )} às ${formatTimeSP(detail.occurred_at)}`}
                </Text>

                <AmountText
                  value={detail.amount_norm}
                  signed
                  muted={effectiveExcludedPreview}
                  size={TYPOGRAPHY.size.hero}
                  weight="bold"
                  glow={!effectiveExcludedPreview}
                  testID="tx-detail-amount"
                />
              </GlassCard>

              {feedback ? (
                <GlassCard
                  variant="card"
                  tone="neutral"
                  tintColor={
                    feedback.tone === 'success'
                      ? COLORS.accent.incomeTint
                      : COLORS.accent.expenseTint
                  }
                  testID="tx-detail-feedback"
                  contentStyle={styles.feedbackRow}
                >
                  <CheckCircle2
                    size={18}
                    color={
                      feedback.tone === 'success'
                        ? COLORS.semantic.income
                        : COLORS.semantic.error
                    }
                  />
                  <Text style={styles.feedbackText}>{feedback.text}</Text>
                </GlassCard>
              ) : null}

              <GlassCard variant="card" contentStyle={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Categorização</Text>

                <Pressable
                  onPress={() => setPickerOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Alterar categoria"
                  testID="change-category-btn"
                  style={({ pressed }) => [styles.selectorRow, pressed ? styles.pressed : null]}
                >
                  <View style={styles.selectorLeft}>
                    <View
                      style={[
                        styles.catDot,
                        {
                          backgroundColor:
                            selectedCategory?.group_color ||
                            selectedCategory?.color ||
                            detail.category_group_color ||
                            COLORS.accent.ice,
                        },
                      ]}
                    />
                    <View style={styles.selectorTextWrap}>
                      <Text style={styles.selectorValue} numberOfLines={1}>
                        {selectedCategory?.description_pt ?? detail.category_name_pt}
                      </Text>
                      <Text style={styles.selectorGroup} numberOfLines={1}>
                        {selectedCategory?.group_name_pt ?? detail.category_group_name_pt}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.selectorAction}>
                    <Tag size={14} color={COLORS.accent.ice} />
                    <Text style={styles.selectorActionText}>Alterar</Text>
                    <ChevronRight size={16} color={COLORS.text.secondary} />
                  </View>
                </Pressable>

                <View style={styles.divider} />

                <View style={styles.switchRow}>
                  <View style={styles.switchTextWrap}>
                    <View style={styles.switchTitleLine}>
                      <Sparkles size={15} color={COLORS.accent.ice} />
                      <Text style={styles.switchTitle}>Aplicar a semelhantes</Text>
                    </View>
                    <Text style={styles.switchHint}>
                      Cria regra automática R9 para lançamentos presentes e futuros parecidos.
                    </Text>
                  </View>
                  <Switch
                    value={applyToSimilar}
                    onValueChange={(nextValue) => {
                      void Haptics.selectionAsync().catch(() => undefined);
                      updateDraft({ applyToSimilar: nextValue });
                    }}
                    disabled={matchOptions.length === 0}
                    trackColor={{ false: 'rgba(255,255,255,0.16)', true: 'rgba(56, 189, 248, 0.45)' }}
                    thumbColor={applyToSimilar ? COLORS.accent.ice : '#CBD5E1'}
                    testID="toggle-apply-similar"
                  />
                </View>

                {applyToSimilar && matchOptions.length > 0 ? (
                  <View style={styles.matchOptionsWrap} testID="match-options-list">
                    <Text style={styles.matchHeading}>Critério de correspondência:</Text>
                    {matchOptions.map((option) => {
                      const active = selectedMatchType === option.matchType;
                      return (
                        <Pressable
                          key={option.matchType}
                          onPress={() => {
                            void Haptics.selectionAsync().catch(() => undefined);
                            updateDraft({ matchType: option.matchType });
                          }}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active }}
                          testID={`match-option-${option.matchType}`}
                          style={[styles.matchChip, active ? styles.matchChipActive : null]}
                        >
                          <Text style={styles.matchLabel}>{option.label}</Text>
                          <Text style={styles.matchPreview} numberOfLines={1}>
                            {option.preview}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                <View style={styles.divider} />

                <View style={styles.switchRow}>
                  <View style={styles.switchTextWrap}>
                    <Text style={styles.switchTitle}>Ignorar nos totais do painel</Text>
                    <Text style={styles.switchHint}>
                      Remove este lançamento dos cálculos de receitas, despesas e gráfico.
                    </Text>
                  </View>
                  <Switch
                    value={effectiveExcludedPreview}
                    onValueChange={(nextValue) => {
                      void Haptics.selectionAsync().catch(() => undefined);
                      updateDraft({ manualExcluded: nextValue });
                    }}
                    trackColor={{ false: 'rgba(255,255,255,0.16)', true: 'rgba(56, 189, 248, 0.45)' }}
                    thumbColor={effectiveExcludedPreview ? COLORS.accent.ice : '#CBD5E1'}
                    testID="toggle-exclude-tx"
                  />
                </View>

                {manualExcluded !== null ? (
                  <Pressable
                    onPress={() => {
                      void Haptics.selectionAsync().catch(() => undefined);
                      updateDraft({ manualExcluded: null });
                    }}
                    accessibilityRole="button"
                    hitSlop={8}
                    testID="restore-auto-exclude-btn"
                    style={styles.restoreBtn}
                  >
                    <RotateCcw size={13} color={COLORS.accent.ice} />
                    <Text style={styles.restoreText}>Restaurar regra automática</Text>
                  </Pressable>
                ) : null}

                <NeonButton
                  label="Salvar alterações"
                  tone="cyan"
                  fullWidth
                  disabled={!canSave}
                  loading={patchMutation.isPending}
                  onPress={handleSave}
                  testID="save-tx-changes-btn"
                />
              </GlassCard>

              <GlassCard variant="card" contentStyle={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Detalhes técnicos</Text>
                <MetaRow label="Conta" value={detail.account_name} />
                <MetaRow label="Classificação" value={getTransactionKindLabel(detail.kind)} />
                {installmentLabel ? <MetaRow label="Cartão" value={installmentLabel} /> : null}
                {detail.merchant_name ? (
                  <MetaRow label="Estabelecimento" value={detail.merchant_name} />
                ) : null}
                {detail.merchant_cnpj ? (
                  <MetaRow label="CNPJ" value={detail.merchant_cnpj} />
                ) : null}
                {detail.counterparty_name ? (
                  <MetaRow label="Contraparte" value={detail.counterparty_name} />
                ) : null}
                {detail.counterparty_doc ? (
                  <MetaRow label="Doc. recebedor" value={detail.counterparty_doc} />
                ) : null}
                {detail.operation_type ? (
                  <MetaRow label="Operação" value={detail.operation_type} />
                ) : null}
                {detail.description_raw && detail.description_raw !== detail.description ? (
                  <MetaRow label="Descrição original" value={detail.description_raw} />
                ) : null}
                {detail.paired_tx_id ? (
                  <Text style={styles.pairedHint}>
                    Lançamento pareado automaticamente com outra conta para evitar contagem dupla.
                  </Text>
                ) : null}
              </GlassCard>
            </>
          )}
        </ScrollView>

        <CategoryPickerModal
          visible={pickerOpen}
          title="Escolher nova categoria"
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelect={(categoryId) => {
            if (categoryId) {
              updateDraft({ categoryId });
            }
          }}
          onClose={() => setPickerOpen(false)}
          testID="tx-detail-category-modal"
        />
      </SafeAreaView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    gap: SPACING.md,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.glass.fill,
    borderWidth: 1,
    borderColor: COLORS.glass.hairline,
  },
  headerTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.section,
  },
  headerSpacer: {
    width: 42,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.lg,
  },
  heroCard: {
    gap: SPACING.sm,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs + 2,
  },
  heroDescription: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.title,
    lineHeight: TYPOGRAPHY.lineHeight.title,
  },
  heroSubtitle: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.caption,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  feedbackText: {
    flex: 1,
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.body,
    lineHeight: TYPOGRAPHY.lineHeight.body,
  },
  sectionCard: {
    gap: SPACING.md,
  },
  sectionTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.section,
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    borderRadius: GLASS_METRICS.radius.row,
    borderWidth: 1,
    borderColor: COLORS.glass.strokeStart,
    backgroundColor: COLORS.glass.fillSubtle,
    padding: SPACING.md,
  },
  selectorLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
  },
  catDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  selectorTextWrap: {
    flex: 1,
    gap: 2,
  },
  selectorValue: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.body,
  },
  selectorGroup: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.caption,
  },
  selectorAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectorActionText: {
    color: COLORS.accent.ice,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  pressed: {
    opacity: 0.8,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.glass.hairlineSubtle,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  switchTextWrap: {
    flex: 1,
    gap: 4,
  },
  switchTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  switchTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.body,
  },
  switchHint: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.caption,
    lineHeight: TYPOGRAPHY.lineHeight.caption,
  },
  matchOptionsWrap: {
    gap: SPACING.xs + 2,
  },
  matchHeading: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  matchChip: {
    borderRadius: GLASS_METRICS.radius.row - 4,
    borderWidth: 1,
    borderColor: COLORS.glass.hairlineSubtle,
    backgroundColor: COLORS.glass.fillSubtle,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 2,
  },
  matchChipActive: {
    borderColor: COLORS.accent.iceBorder,
    backgroundColor: COLORS.accent.iceTint,
  },
  matchLabel: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.caption,
  },
  matchPreview: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  restoreText: {
    color: COLORS.accent.ice,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  metaLabel: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.caption,
  },
  metaValue: {
    flex: 1,
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
    textAlign: 'right',
  },
  pairedHint: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
    lineHeight: TYPOGRAPHY.lineHeight.micro,
    marginTop: SPACING.xs,
  },
  errorCard: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  errorTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.section,
    textAlign: 'center',
  },
  errorBody: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.body,
    textAlign: 'center',
  },
});
