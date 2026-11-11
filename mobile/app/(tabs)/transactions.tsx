import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassBackground, GlassCard } from '../../src/components';
import { COLORS, SPACING, TAB_BAR_CLEARANCE, TYPOGRAPHY } from '../../src/theme/tokens';

/**
 * Tela de Transações (shell visual até integração completa na Fase 6).
 */
export default function TransactionsScreen() {
  return (
    <GlassBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Transações</Text>
          <GlassCard variant="card">
            <Text style={styles.subtitle}>
              Extrato unificado Inter + cartão será conectado na Fase 6.
            </Text>
          </GlassCard>
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
  title: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.bold,
    fontSize: TYPOGRAPHY.size.title,
  },
  subtitle: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.body,
    lineHeight: TYPOGRAPHY.lineHeight.body,
  },
});
