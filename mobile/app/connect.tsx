import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PluggyConnect } from 'react-native-pluggy-connect';
import { ChevronLeft } from 'lucide-react-native';
import {
  GlassBackground,
  GlassCard,
  NeonButton,
  SkeletonCard,
  StatusPill,
} from '../src/components';
import { useConnectTokenMutation, useRegisterItemMutation } from '../src/hooks';
import { COLORS, SPACING, TYPOGRAPHY } from '../src/theme/tokens';

/**
 * Tela modal para reconexão ou autorização OAuth via widget oficial Pluggy Connect.
 */
export default function ConnectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ itemId?: string }>();
  const targetItemId = typeof params.itemId === 'string' && params.itemId ? params.itemId : undefined;

  const tokenMutation = useConnectTokenMutation();
  const registerMutation = useRegisterItemMutation();
  const requestedRef = useRef(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);

  const triggerTokenRequest = () => {
    setWidgetError(null);
    tokenMutation.mutate(
      { itemId: targetItemId },
      {
        onError: (err) => {
          setWidgetError(err instanceof Error ? err.message : 'Erro ao gerar connectToken.');
        },
      },
    );
  };

  useEffect(() => {
    if (!requestedRef.current) {
      requestedRef.current = true;
      tokenMutation.mutate(
        { itemId: targetItemId },
        {
          onError: (err) => {
            setWidgetError(err instanceof Error ? err.message : 'Erro ao gerar connectToken.');
          },
        },
      );
    }
    // Executa apenas na montagem para emitir o connectToken inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/settings');
    }
  };

  const accessToken = tokenMutation.data?.accessToken;

  return (
    <GlassBackground testID="connect-widget-screen">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Fechar widget"
            hitSlop={6}
            style={styles.backBtn}
            testID="connect-back-btn"
          >
            <ChevronLeft size={20} color={COLORS.text.primary} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>Pluggy Connect</Text>
            <Text style={styles.subtitle}>
              {targetItemId ? 'Atualizar autorização Open Finance' : 'Conectar Banco Inter'}
            </Text>
          </View>
          <StatusPill label="OAuth Seguro" variant="info" />
        </View>

        <View style={styles.body}>
          {tokenMutation.isPending || registerMutation.isPending ? (
            <View style={styles.stack} testID="connect-loading">
              <SkeletonCard />
              <Text style={styles.hint}>
                {registerMutation.isPending
                  ? 'Sincronizando contas e transações após autorização...'
                  : 'Gerando token temporário na Pluggy...'}
              </Text>
            </View>
          ) : widgetError ? (
            <GlassCard
              variant="card"
              tone="neutral"
              tintColor={COLORS.accent.expenseTint}
              contentStyle={styles.stack}
              testID="connect-error"
            >
              <Text style={styles.errorTitle}>Falha no widget Pluggy</Text>
              <Text style={styles.subtitle}>{widgetError}</Text>
              <NeonButton
                label="Gerar novo token"
                tone="cyan"
                onPress={triggerTokenRequest}
                testID="connect-retry-btn"
              />
            </GlassCard>
          ) : accessToken ? (
            <View style={styles.widgetWrap} testID="pluggy-widget-container">
              <PluggyConnect
                connectToken={accessToken}
                updateItem={targetItemId}
                language="pt"
                theme="dark"
                onSuccess={({ item }) => {
                  registerMutation.mutate(
                    { itemId: item.id, sync: true },
                    {
                      onSuccess: () => handleClose(),
                      onError: (err) =>
                        setWidgetError(
                          err instanceof Error ? err.message : 'Erro ao sincronizar após retorno.',
                        ),
                    },
                  );
                }}
                onError={(error) => {
                  setWidgetError(error.message || 'Ocorreu um erro durante a conexão.');
                }}
                onClose={handleClose}
              />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.glass.hairline,
    backgroundColor: COLORS.glass.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.bold,
    fontSize: TYPOGRAPHY.size.section,
  },
  subtitle: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.caption,
  },
  body: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  stack: {
    gap: SPACING.md,
  },
  hint: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
    textAlign: 'center',
  },
  errorTitle: {
    color: COLORS.semantic.error,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.section,
  },
  widgetWrap: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
});
