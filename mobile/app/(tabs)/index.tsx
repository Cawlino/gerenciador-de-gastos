import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles } from 'lucide-react-native';
import {
  AmountText,
  GlassBackground,
  GlassCard,
  NeonButton,
  StatusPill,
} from '../../src/components';
import { COLORS, SPACING, TAB_BAR_CLEARANCE, TYPOGRAPHY } from '../../src/theme/tokens';

/**
 * Tela principal do Painel (shell do Design System até a ligação com API na Fase 6).
 */
export default function DashboardScreen() {
  const router = useRouter();

  return (
    <GlassBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.kicker}>Gerenciador de Gastos</Text>
              <Text style={styles.title}>Painel</Text>
            </View>
            <StatusPill label="Design System" variant="info" />
          </View>

          <GlassCard variant="elevated" tone="cyan">
            <Text style={styles.cardLabel}>Saldo Consolidado</Text>
            <AmountText
              value={6120}
              tone="neutral"
              size={TYPOGRAPHY.size.hero}
              weight="bold"
              glow
              style={styles.heroAmount}
            />
            <Text style={styles.subtitle}>
              Tokens, shader SkSL e componentes Liquid Glass prontos para a Fase 6.
            </Text>
          </GlassCard>

          {__DEV__ ? (
            <NeonButton
              label="Abrir Playground Liquid Glass"
              tone="purple"
              fullWidth
              icon={<Sparkles size={18} color={COLORS.neon.purple} />}
              onPress={() => router.push('/playground' as Href)}
            />
          ) : null}
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
    gap: SPACING.lg,
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
  cardLabel: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  heroAmount: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.body,
    lineHeight: TYPOGRAPHY.lineHeight.body,
  },
});
