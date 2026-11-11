import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassBackground, GlassCard, StatusPill } from '../../src/components';
import { COLORS, SPACING, TAB_BAR_CLEARANCE, TYPOGRAPHY } from '../../src/theme/tokens';

/**
 * Tela de Conexão Banco Inter / Pluggy (shell visual até Fase 6/7).
 */
export default function SettingsScreen() {
  return (
    <GlassBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Conexão</Text>
          <GlassCard variant="card" contentStyle={styles.cardInner}>
            <StatusPill label="Pluggy v2 pronto" variant="info" />
            <Text style={styles.subtitle}>
              O fluxo de vínculo Meu Pluggy e sincronização manual será ativado na Fase 6/7.
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
  cardInner: {
    gap: SPACING.md,
  },
  subtitle: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.body,
    lineHeight: TYPOGRAPHY.lineHeight.body,
  },
});
