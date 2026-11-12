import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Sparkles, Trash2 } from 'lucide-react-native';
import { getApiErrorMessage } from '../src/api/client';
import {
  GlassBackground,
  GlassCard,
  NeonButton,
  SkeletonRow,
  StatusPill,
} from '../src/components';
import { useDeleteRuleMutation, useRules } from '../src/hooks';
import { COLORS, GLASS_METRICS, SPACING, TYPOGRAPHY } from '../src/theme/tokens';
import { formatMatchTypeBadge } from '../src/utils/transactionHelpers';

/**
 * Tela modal para visualizar e remover regras automáticas de categorização (R9).
 */
export default function RulesScreen() {
  const router = useRouter();
  const rulesQuery = useRules();
  const deleteRuleMutation = useDeleteRuleMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rules = rulesQuery.data?.results ?? [];

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/transactions' as Href);
    }
  };

  const handleDeleteRule = (id: string) => {
    setErrorMessage(null);
    deleteRuleMutation.mutate(id, {
      onError: (err) => {
        setErrorMessage(getApiErrorMessage(err));
      },
    });
  };

  return (
    <GlassBackground testID="rules-screen">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            testID="rules-back-btn"
            style={styles.backBtn}
          >
            <ArrowLeft size={18} color={COLORS.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Regras de categorização</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <GlassCard variant="card" tone="purple" contentStyle={styles.introCard}>
            <View style={styles.introTitleRow}>
              <Sparkles size={16} color={COLORS.neon.purple} />
              <Text style={styles.introTitle}>Aplicar a semelhantes (R9)</Text>
            </View>
            <Text style={styles.introBody}>
              Regras criadas ao recategorizar transações são aplicadas automaticamente aos
              próximos syncs (ordem: CNPJ, documento do recebedor, descrição).
            </Text>
          </GlassCard>

          {errorMessage ? (
            <GlassCard tone="purple" testID="rules-error-banner">
              <Text style={styles.errorText}>{errorMessage}</Text>
            </GlassCard>
          ) : null}

          {rulesQuery.isLoading ? (
            <View style={styles.listGap} testID="rules-loading">
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : rulesQuery.isError ? (
            <GlassCard tone="purple" contentStyle={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Erro ao carregar regras</Text>
              <Text style={styles.emptyBody}>{getApiErrorMessage(rulesQuery.error)}</Text>
              <NeonButton
                label="Tentar novamente"
                tone="cyan"
                size="md"
                onPress={() => {
                  void rulesQuery.refetch();
                }}
              />
            </GlassCard>
          ) : rules.length === 0 ? (
            <GlassCard testID="rules-empty" contentStyle={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Nenhuma regra cadastrada</Text>
              <Text style={styles.emptyBody}>
                Abra qualquer transação, escolha uma categoria e ative “Aplicar a semelhantes” para
                criar uma regra.
              </Text>
            </GlassCard>
          ) : (
            <View style={styles.listGap}>
              {rules.map((rule) => (
                <GlassCard
                  key={rule.id}
                  variant="row"
                  testID={`rule-row-${rule.id}`}
                  contentStyle={styles.ruleRow}
                >
                  <View style={styles.ruleInfo}>
                    <View style={styles.ruleTop}>
                      <StatusPill
                        label={formatMatchTypeBadge(rule.match_type)}
                        variant="info"
                        showDot={false}
                      />
                      <StatusPill label={rule.category_name_pt} variant="success" showDot={false} />
                    </View>
                    <Text style={styles.ruleLabel} numberOfLines={1}>
                      {rule.label || rule.match_value}
                    </Text>
                    <Text style={styles.ruleMatchValue} numberOfLines={1}>
                      {rule.match_value}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => handleDeleteRule(rule.id)}
                    disabled={deleteRuleMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Remover regra ${rule.label || rule.match_value}`}
                    testID={`delete-rule-${rule.id}`}
                    style={({ pressed }) => [styles.deleteBtn, pressed ? styles.pressed : null]}
                  >
                    <Trash2 size={16} color={COLORS.semantic.error} />
                  </Pressable>
                </GlassCard>
              ))}
            </View>
          )}
        </ScrollView>
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
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.glass.fill,
    borderWidth: 1,
    borderColor: COLORS.glass.strokeStart,
  },
  headerTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.section,
  },
  headerSpacer: {
    width: 38,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.md,
  },
  introCard: {
    gap: SPACING.xs + 2,
  },
  introTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  introTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.body,
  },
  introBody: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.caption,
    lineHeight: TYPOGRAPHY.lineHeight.caption,
  },
  errorText: {
    color: COLORS.semantic.error,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  listGap: {
    gap: SPACING.sm + 2,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  ruleInfo: {
    flex: 1,
    gap: 4,
  },
  ruleTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  ruleLabel: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.body,
  },
  ruleMatchValue: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
  },
  deleteBtn: {
    width: 38,
    height: 38,
    borderRadius: GLASS_METRICS.radius.row - 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251, 113, 133, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251, 113, 133, 0.35)',
  },
  pressed: {
    opacity: 0.75,
  },
  emptyCard: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  emptyTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.section,
    textAlign: 'center',
  },
  emptyBody: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.body,
    textAlign: 'center',
    lineHeight: TYPOGRAPHY.lineHeight.body,
  },
});
