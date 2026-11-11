import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, RefreshCw, Sparkles } from 'lucide-react-native';
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
  TransactionRow,
  type DonutCategorySlice,
  type TransactionRowItem,
} from '../src/components';
import { COLORS, SPACING, TYPOGRAPHY } from '../src/theme/tokens';
import { getCurrentMonthSP } from '../src/utils/format';

const SAMPLE_SLICES: DonutCategorySlice[] = [
  { id: 'food', name: 'Alimentação', amount: 1480.5, percent: 41.2, color: COLORS.neon.cyan },
  { id: 'housing', name: 'Moradia', amount: 1120.0, percent: 31.1, color: COLORS.neon.purple },
  { id: 'transport', name: 'Transporte', amount: 590.2, percent: 16.4, color: COLORS.neon.mint },
  { id: 'health', name: 'Saúde', amount: 405.8, percent: 11.3, color: COLORS.semantic.expense },
];

const SAMPLE_ROWS: TransactionRowItem[] = [
  {
    id: 'tx-1',
    description: 'Supermercado Pão de Açúcar',
    categoryName: 'Alimentação',
    categoryColor: COLORS.neon.cyan,
    amountNorm: -284.9,
    date: '2026-11-11T15:42:00-03:00',
    status: 'POSTED',
  },
  {
    id: 'tx-2',
    description: 'Uber *Trip Centro',
    categoryName: 'Transporte',
    categoryColor: COLORS.neon.mint,
    amountNorm: -32.4,
    date: '2026-11-11T11:18:00-03:00',
    status: 'PENDING',
  },
  {
    id: 'tx-3',
    description: 'Pagamento Fatura Inter',
    categoryName: 'Cartão',
    categoryColor: COLORS.neon.purple,
    amountNorm: -1950.0,
    date: '2026-11-10T18:05:00-03:00',
    status: 'POSTED',
    effectiveExcluded: true,
    excludedReason: 'ignorado',
  },
  {
    id: 'tx-4',
    description: 'Pix Salário Mensal',
    categoryName: 'Salário',
    categoryColor: COLORS.neon.mint,
    amountNorm: 8500.0,
    date: '2026-11-05T09:00:00-03:00',
    status: 'POSTED',
  },
];

/**
 * Tela de Playground (DEV) reunindo todos os 10 componentes do Design System Liquid Glass.
 */
export default function PlaygroundScreen() {
  const router = useRouter();
  const [month, setMonth] = useState(() => getCurrentMonthSP());
  const [forceFallback, setForceFallback] = useState(false);
  const [refraction, setRefraction] = useState(0.04);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [lastTappedRow, setLastTappedRow] = useState<string | null>(null);

  const totalExpense = SAMPLE_SLICES.reduce((acc, s) => acc + s.amount, 0);

  return (
    <GlassBackground testID="playground-screen">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => {
                if (router.canGoBack()) router.back();
              }}
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              style={styles.backBtn}
            >
              <ChevronLeft size={20} color={COLORS.text.primary} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.title}>Playground Liquid Glass</Text>
              <Text style={styles.subtitle}>Tokens, Shader SkSL e 10 componentes</Text>
            </View>
            <StatusPill
              label={forceFallback ? 'Fallback Blur' : 'Shader SkSL'}
              variant={forceFallback ? 'warning' : 'success'}
            />
          </View>

          <MonthSwitcher
            month={month}
            onChange={setMonth}
            testID="playground-month-switcher"
          />

          <GlassCard
            variant="elevated"
            tone="cyan"
            forceFallback={forceFallback}
            refraction={refraction}
            testID="playground-hero-card"
          >
            <Text style={styles.sectionKicker}>Cartão Principal · Refração {refraction}</Text>
            <AmountText
              value={8500 - totalExpense}
              signed
              glow
              size={TYPOGRAPHY.size.hero}
              weight="bold"
              style={styles.heroValue}
            />
            <View style={styles.metricRow}>
              <View>
                <Text style={styles.metricLabel}>Entradas</Text>
                <AmountText value={8500} signed size={TYPOGRAPHY.size.section} />
              </View>
              <View>
                <Text style={styles.metricLabel}>Saídas</Text>
                <AmountText value={-totalExpense} signed size={TYPOGRAPHY.size.section} />
              </View>
            </View>
          </GlassCard>

          <View style={styles.controlsRow}>
            <NeonButton
              label={forceFallback ? 'Ativar Shader SkSL' : 'Testar Modo Fallback'}
              tone="cyan"
              icon={<Sparkles size={16} color={COLORS.neon.cyan} />}
              onPress={() => setForceFallback((prev) => !prev)}
              style={styles.flexBtn}
              testID="toggle-fallback-btn"
            />
            <NeonButton
              label={`Refração ${refraction === 0.04 ? 'Alta' : 'Padrão'}`}
              tone="purple"
              onPress={() => setRefraction((prev) => (prev === 0.04 ? 0.08 : 0.04))}
              style={styles.flexBtn}
              testID="toggle-refraction-btn"
            />
          </View>

          <GlassCard variant="card" forceFallback={forceFallback}>
            <Text style={styles.sectionTitle}>DonutChart por Categoria</Text>
            <DonutChart
              slices={SAMPLE_SLICES}
              totalExpense={totalExpense}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={setSelectedCategoryId}
              testID="playground-donut"
            />
          </GlassCard>

          <GlassCard variant="card" forceFallback={forceFallback}>
            <Text style={styles.sectionTitle}>Badges StatusPill & NeonButton</Text>
            <View style={styles.pillsWrap}>
              <StatusPill label="Conectado" variant="success" />
              <StatusPill label="pendente" variant="warning" />
              <StatusPill label="Erro Pluggy" variant="error" />
              <StatusPill label="Sincronizando" variant="info" />
              <StatusPill label="ignorado" variant="muted" />
            </View>
            <View style={styles.buttonsStack}>
              <NeonButton
                label="Sincronizar Agora"
                tone="mint"
                icon={<RefreshCw size={16} color={COLORS.neon.mint} />}
                onPress={() => setLastTappedRow('Sincronização acionada')}
              />
              <NeonButton
                label={showSkeleton ? 'Ocultar Skeletons' : 'Visualizar Skeletons'}
                tone="neutral"
                onPress={() => setShowSkeleton((prev) => !prev)}
                testID="toggle-skeleton-btn"
              />
            </View>
          </GlassCard>

          {showSkeleton ? (
            <View style={styles.stack} testID="playground-skeletons">
              <SkeletonCard />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : (
            <View style={styles.stack}>
              <Text style={styles.sectionTitle}>
                TransactionRows {lastTappedRow ? `· ${lastTappedRow}` : ''}
              </Text>
              {SAMPLE_ROWS.map((row) => (
                <TransactionRow
                  key={row.id}
                  item={row}
                  onPress={(item) => setLastTappedRow(item.description)}
                />
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
  content: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.bold,
    fontSize: TYPOGRAPHY.size.title,
  },
  subtitle: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.caption,
  },
  sectionKicker: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  heroValue: {
    marginVertical: SPACING.sm,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
  },
  metricLabel: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.micro,
    marginBottom: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  flexBtn: {
    flex: 1,
  },
  sectionTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.section,
    marginBottom: SPACING.md,
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  buttonsStack: {
    gap: SPACING.sm,
  },
  stack: {
    gap: SPACING.sm + 2,
  },
});
