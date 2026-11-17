import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CheckCircle2,
  CreditCard,
  FlaskConical,
  History,
  Landmark,
  Link2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react-native';
import { ApiError } from '../../src/api/client';
import type { AccountDto, PluggyItemDto, SyncResultDto, SyncRunDto } from '../../src/api/types';
import {
  AmountText,
  GlassBackground,
  GlassCard,
  LiquidPullRefresh,
  LiquidPullScrollView,
  NeonButton,
  SkeletonCard,
  SkeletonRow,
  StatusPill,
} from '../../src/components';
import {
  useItems,
  useRegisterItemMutation,
  useSettings,
  useSyncMutation,
  useUpdateSettingsMutation,
} from '../../src/hooks';
import { usePrivacyDemo } from '../../src/context/PrivacyDemoContext';
import { COLORS, GLASS_METRICS, SPACING, TAB_BAR_CLEARANCE, TYPOGRAPHY } from '../../src/theme/tokens';
import {
  isValidUuid,
  mapItemStatus,
  mapSyncRunStatus,
  mapTriggerLabel,
  maskItemId,
} from '../../src/utils/connectionHelpers';
import { formatDayGroupLabel, formatPrivacyBRL, formatSyncRelative, formatTimeSP } from '../../src/utils/format';

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Falha inesperada na comunicação com o servidor.';
}

function readCreditNumber(account: AccountDto, key: string): number | null {
  const raw = account.credit_data?.[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * Tela de Conexão Open Finance (Banco Inter / MeuPluggy), sync e regras R4/R5.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { isPrivacyHidden, isDemoMode, setDemoMode } = usePrivacyDemo();
  const itemsQuery = useItems();
  const settingsQuery = useSettings();
  const syncMutation = useSyncMutation();
  const registerMutation = useRegisterItemMutation();
  const updateSettingsMutation = useUpdateSettingsMutation();

  const [itemIdInput, setItemIdInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [lastSyncBanner, setLastSyncBanner] = useState<SyncResultDto | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const localScrollY = useSharedValue(0);

  const primaryItem: PluggyItemDto | undefined = itemsQuery.data?.items[0];
  const accounts: AccountDto[] = itemsQuery.data?.accounts ?? [];
  const syncRuns: SyncRunDto[] = itemsQuery.data?.syncRuns ?? [];

  const excludeOwnTransfers = settingsQuery.data?.settings.exclude_own_transfers ?? true;
  const excludeInvestments = settingsQuery.data?.settings.exclude_investments ?? true;

  const isBusy = syncMutation.isPending || registerMutation.isPending;
  const statusInfo = mapItemStatus(primaryItem?.status, primaryItem?.execution_status);

  const handleManualSync = useCallback(
    (fullSync: boolean, trigger: 'manual' | 'pull_to_refresh' = 'manual') => {
      setFormError(null);
      syncMutation.mutate(
        {
          itemId: primaryItem?.id,
          refresh: !fullSync,
          fullSync,
          trigger,
        },
        {
          onSuccess: (res) => {
            setLastSyncBanner(res.sync);
          },
          onError: (err) => {
            setFormError(getErrorMessage(err));
          },
        },
      );
    },
    [primaryItem?.id, syncMutation],
  );

  const handlePullToRefresh = useCallback(() => {
    if (primaryItem) {
      handleManualSync(false, 'pull_to_refresh');
    } else {
      setManualRefreshing(true);
      void Promise.all([itemsQuery.refetch(), settingsQuery.refetch()]).finally(() => {
        setManualRefreshing(false);
      });
    }
  }, [handleManualSync, itemsQuery, primaryItem, settingsQuery]);

  const handleRegisterItem = () => {
    const trimmed = itemIdInput.trim();
    if (!isValidUuid(trimmed)) {
      setFormError('Informe um UUID válido da Pluggy (ex.: 8 blocos separados por hífen).');
      return;
    }

    setFormError(null);
    registerMutation.mutate(
      { itemId: trimmed, sync: true },
      {
        onSuccess: (res) => {
          setItemIdInput('');
          if (res.sync) setLastSyncBanner(res.sync);
        },
        onError: (err) => {
          setFormError(getErrorMessage(err));
        },
      },
    );
  };

  const handleOpenReconnect = () => {
    const target = primaryItem
      ? (`/connect?itemId=${encodeURIComponent(primaryItem.id)}` as Href)
      : ('/connect' as Href);
    router.push(target);
  };

  return (
    <GlassBackground testID="connection-screen">
      <SafeAreaView style={styles.safe} edges={['top']}>
        <LiquidPullRefresh
          refreshing={manualRefreshing || syncMutation.isPending}
          onRefresh={handlePullToRefresh}
          scrollYSV={localScrollY}
          testID="settings-pull-refresh"
        >
          {(pullBind) => (
            <LiquidPullScrollView
              pullBind={pullBind}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.kicker}>Open Finance</Text>
              <Text style={styles.title}>Conexão</Text>
            </View>
            <StatusPill
              label={statusInfo.label}
              variant={statusInfo.variant}
              testID="connection-status-pill"
            />
          </View>

          {itemsQuery.isLoading ? (
            <View style={styles.stack} testID="connection-loading">
              <SkeletonCard />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : null}

          {itemsQuery.isError ? (
            <GlassCard
              tone="neutral"
              tintColor={COLORS.accent.expenseTint}
              testID="connection-error-card"
            >
              <Text style={styles.errorTitle}>Não foi possível carregar a conexão</Text>
              <Text style={styles.errorBody}>{getErrorMessage(itemsQuery.error)}</Text>
              <NeonButton
                label="Tentar novamente"
                tone="cyan"
                onPress={() => void itemsQuery.refetch()}
                style={styles.retryBtn}
                testID="connection-retry-button"
              />
              {!isDemoMode ? (
                <NeonButton
                  label="Explorar em Modo Demo (12 meses)"
                  tone="purple"
                  icon={<FlaskConical size={16} color={COLORS.orb.purpleSolid} />}
                  onPress={() => setDemoMode(true)}
                  style={styles.retryBtn}
                  testID="connection-fallback-demo-button"
                />
              ) : null}
            </GlassCard>
          ) : null}

          {!itemsQuery.isLoading && !itemsQuery.isError ? (
            <>
              <GlassCard variant="elevated" tone="neutral" testID="connection-status-card">
                <View style={styles.itemHeader}>
                  <View style={styles.iconCircle}>
                    <Landmark size={20} color={COLORS.accent.ice} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.cardTitle}>
                      {primaryItem?.connector_name || 'Banco Inter · MeuPluggy'}
                    </Text>
                    <Text style={styles.cardSubtitle}>
                      {primaryItem
                        ? `Item ${maskItemId(primaryItem.id)} · ${formatSyncRelative(primaryItem.last_synced_at)}`
                        : 'Nenhum Item Pluggy conectado ainda'}
                    </Text>
                  </View>
                </View>

                {primaryItem?.consent_expires_at ? (
                  <View style={styles.metaStrip}>
                    <ShieldCheck size={14} color={COLORS.semantic.income} />
                    <Text style={styles.metaText}>
                      Consentimento válido até {formatDayGroupLabel(primaryItem.consent_expires_at)}
                    </Text>
                  </View>
                ) : null}

                {primaryItem?.error_message ? (
                  <Text style={styles.inlineWarn}>{primaryItem.error_message}</Text>
                ) : null}

                <View style={styles.actionStack}>
                  <NeonButton
                    label="Sincronizar agora"
                    tone="cyan"
                    fullWidth
                    loading={syncMutation.isPending}
                    disabled={!primaryItem || isBusy}
                    icon={<RefreshCw size={16} color={COLORS.accent.ice} />}
                    onPress={() => handleManualSync(false)}
                    testID="sync-now-button"
                  />
                  <View style={styles.twoColRow}>
                    <NeonButton
                      label="Sync 12 meses"
                      tone="neutral"
                      loading={syncMutation.isPending}
                      disabled={!primaryItem || isBusy}
                      onPress={() => handleManualSync(true)}
                      style={styles.flex1}
                      testID="sync-full-button"
                    />
                    <NeonButton
                      label={primaryItem ? 'Reconectar' : 'Conectar Widget'}
                      tone="neutral"
                      icon={<Link2 size={16} color={COLORS.accent.ice} />}
                      onPress={handleOpenReconnect}
                      style={styles.flex1}
                      testID="reconnect-button"
                    />
                  </View>
                </View>
              </GlassCard>

              {lastSyncBanner ? (
                <GlassCard
                  variant="row"
                  tone="neutral"
                  tintColor={COLORS.accent.incomeTint}
                  testID="sync-feedback-banner"
                >
                  <View style={styles.bannerRow}>
                    <CheckCircle2 size={18} color={COLORS.semantic.income} />
                    <Text style={styles.bannerText}>
                      {`Sync concluído: ${lastSyncBanner.fetchedCount} lidas · ${lastSyncBanner.upsertedCount} salvas · ${lastSyncBanner.pairedCount} pareadas`}
                    </Text>
                  </View>
                </GlassCard>
              ) : null}

              {formError ? (
                <GlassCard
                  variant="row"
                  tintColor={COLORS.accent.expenseTint}
                  testID="connection-form-error"
                >
                  <Text style={styles.inlineWarn}>{formError}</Text>
                </GlassCard>
              ) : null}

              <GlassCard variant="card" contentStyle={styles.stack}>
                <Text style={styles.sectionTitle}>Contas vinculadas</Text>
                {accounts.length === 0 ? (
                  <Text style={styles.cardSubtitle} testID="accounts-empty">
                    Conecte e sincronize um Item para listar conta corrente e cartão Inter.
                  </Text>
                ) : (
                  accounts.map((acc) => {
                    const isCredit = acc.type === 'CREDIT';
                    const availableLimit = isCredit ? readCreditNumber(acc, 'availableCreditLimit') : null;
                    return (
                      <GlassCard key={acc.id} variant="row" surface="lightweight" padding={SPACING.md}>
                        <View style={styles.accountRow}>
                          <View style={styles.accountIcon}>
                            {isCredit ? (
                              <CreditCard size={18} color={COLORS.accent.ice} />
                            ) : (
                              <Landmark size={18} color={COLORS.accent.ice} />
                            )}
                          </View>
                          <View style={styles.flex1}>
                            <Text style={styles.accountName} numberOfLines={1}>
                              {acc.marketing_name || acc.name}
                            </Text>
                            <Text style={styles.cardSubtitle}>
                              {isCredit
                                ? availableLimit !== null
                                  ? `Cartão ${acc.number_masked ?? ''} · Disp. ${formatPrivacyBRL(availableLimit, isPrivacyHidden)}`
                                  : `Cartão ${acc.number_masked ?? 'GOLD'}`
                                : `Conta Corrente ${acc.number_masked ?? ''}`}
                            </Text>
                          </View>
                          <AmountText
                            value={isCredit ? -Math.abs(acc.balance) : acc.balance}
                            tone={isCredit ? 'expense' : 'income'}
                            size={TYPOGRAPHY.size.body}
                            weight="semibold"
                          />
                        </View>
                      </GlassCard>
                    );
                  })
                )}
              </GlassCard>

              <GlassCard variant="card" contentStyle={styles.stack}>
                <Text style={styles.sectionTitle}>Vincular Item MeuPluggy</Text>
                <Text style={styles.cardSubtitle}>
                  Cole o UUID do item existente para importar até 12 meses de histórico.
                </Text>
                <TextInput
                  value={itemIdInput}
                  onChangeText={setItemIdInput}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  placeholderTextColor={COLORS.text.secondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  testID="item-id-input"
                />
                <NeonButton
                  label="Vincular e sincronizar 12 meses"
                  tone="cyan"
                  fullWidth
                  loading={registerMutation.isPending}
                  disabled={isBusy}
                  onPress={handleRegisterItem}
                  testID="register-item-button"
                />
              </GlassCard>

              <GlassCard variant="card" contentStyle={styles.stack}>
                <Text style={styles.sectionTitle}>Regras de exclusão (R4 / R5)</Text>
                <View style={styles.switchRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.switchTitle}>Ignorar transferências próprias</Text>
                    <Text style={styles.cardSubtitle}>
                      Oculta envios entre contas de mesma titularidade (Pluggy 04*).
                    </Text>
                  </View>
                  <Switch
                    value={excludeOwnTransfers}
                    disabled={updateSettingsMutation.isPending}
                    onValueChange={(val) => {
                      void Haptics.selectionAsync().catch(() => undefined);
                      updateSettingsMutation.mutate({ exclude_own_transfers: val });
                    }}
                    trackColor={{ false: 'rgba(255,255,255,0.16)', true: 'rgba(56,189,248,0.45)' }}
                    thumbColor={excludeOwnTransfers ? COLORS.accent.ice : '#CBD5E1'}
                    testID="toggle-own-transfers"
                  />
                </View>

                <View style={styles.divider} />

                <View style={styles.switchRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.switchTitle}>Ignorar investimentos na conta</Text>
                    <Text style={styles.cardSubtitle}>
                      Exclui aplicações e resgates CDB/CDB Inter dos gastos (Pluggy 03*).
                    </Text>
                  </View>
                  <Switch
                    value={excludeInvestments}
                    disabled={updateSettingsMutation.isPending}
                    onValueChange={(val) => {
                      void Haptics.selectionAsync().catch(() => undefined);
                      updateSettingsMutation.mutate({ exclude_investments: val });
                    }}
                    trackColor={{ false: 'rgba(255,255,255,0.16)', true: 'rgba(56,189,248,0.45)' }}
                    thumbColor={excludeInvestments ? COLORS.accent.ice : '#CBD5E1'}
                    testID="toggle-investments"
                  />
                </View>
              </GlassCard>

              <GlassCard variant="card" contentStyle={styles.stack}>
                <View style={styles.historyHeader}>
                  <History size={18} color={COLORS.accent.ice} />
                  <Text style={styles.sectionTitle}>Execuções recentes</Text>
                </View>
                {syncRuns.length === 0 ? (
                  <Text style={styles.cardSubtitle}>Nenhuma sincronização registrada ainda.</Text>
                ) : (
                  syncRuns.slice(0, 5).map((run) => {
                    const pill = mapSyncRunStatus(run.status);
                    return (
                      <GlassCard key={run.id} variant="row" surface="lightweight" padding={SPACING.md}>
                        <View style={styles.runRow}>
                          <View style={styles.flex1}>
                            <Text style={styles.accountName}>
                              {`${mapTriggerLabel(run.trigger)} · ${formatTimeSP(run.started_at)}`}
                            </Text>
                            <Text style={styles.cardSubtitle}>
                              {run.error_message
                                ? run.error_message
                                : `${run.fetched_count ?? 0} lidas · ${run.upserted_count ?? 0} salvas · ${run.paired_count ?? 0} pareadas`}
                            </Text>
                          </View>
                          <StatusPill label={pill.label} variant={pill.variant} />
                        </View>
                      </GlassCard>
                    );
                  })
                )}
              </GlassCard>
            </>
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
    gap: SPACING.lg,
  },
  flex1: {
    flex: 1,
  },
  stack: {
    gap: SPACING.md,
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
    fontFamily: TYPOGRAPHY.family.display,
    fontSize: 24,
    letterSpacing: -0.5,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: GLASS_METRICS.radius.row,
    backgroundColor: COLORS.accent.iceTint,
    borderWidth: 1,
    borderColor: COLORS.accent.iceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.section,
  },
  cardSubtitle: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.caption,
    lineHeight: TYPOGRAPHY.lineHeight.caption,
  },
  metaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.md,
  },
  metaText: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.micro,
  },
  actionStack: {
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  bannerText: {
    flex: 1,
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
  },
  errorBorder: {
    borderColor: 'rgba(251, 113, 133, 0.45)',
    borderWidth: 1,
    borderRadius: GLASS_METRICS.radius.row,
  },
  errorTitle: {
    color: COLORS.semantic.error,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.section,
    marginBottom: 4,
  },
  errorBody: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.caption,
    marginBottom: SPACING.md,
  },
  retryBtn: {
    alignSelf: 'flex-start',
  },
  inlineWarn: {
    color: COLORS.semantic.error,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.caption,
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.section,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  accountIcon: {
    width: 38,
    height: 38,
    borderRadius: GLASS_METRICS.radius.row - 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountName: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.body,
  },
  input: {
    minHeight: 48,
    borderRadius: GLASS_METRICS.radius.row,
    borderWidth: 1,
    borderColor: COLORS.glass.hairline,
    backgroundColor: 'rgba(5, 11, 24, 0.55)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.caption,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  switchTitle: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.body,
    marginBottom: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
});
