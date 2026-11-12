import type { StatusPillVariant } from '../components';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida se uma string segue o formato UUID usado pela Pluggy.
 */
export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

/**
 * Mascara um UUID mantendo apenas prefixo e sufixo visíveis na UI.
 */
export function maskItemId(itemId: string): string {
  const clean = itemId.trim();
  if (clean.length <= 12) return clean;
  return `${clean.slice(0, 8)}…${clean.slice(-4)}`;
}

/**
 * Traduz status do Item Pluggy para rótulo amigável e variante do StatusPill.
 */
export function mapItemStatus(
  status: string | null | undefined,
  executionStatus?: string | null,
): { label: string; variant: StatusPillVariant } {
  if (!status) {
    return { label: 'Não conectado', variant: 'muted' };
  }
  const normalized = status.toUpperCase();
  if (normalized === 'UPDATED') {
    return { label: 'Conectado', variant: 'success' };
  }
  if (normalized === 'UPDATING') {
    return { label: 'Sincronizando', variant: 'info' };
  }
  if (normalized === 'WAITING_USER_INPUT' || normalized === 'MFA_REQUIRED') {
    return { label: 'Aguardando usuário', variant: 'warning' };
  }
  if (normalized === 'LOGIN_ERROR' || executionStatus?.toUpperCase().includes('ERROR')) {
    return { label: 'Requer reconexão', variant: 'error' };
  }
  if (normalized === 'OUTDATED') {
    return { label: 'Desatualizado', variant: 'warning' };
  }
  return { label: status, variant: 'info' };
}

/**
 * Traduz status de execução de sincronização para rótulo e variante.
 */
export function mapSyncRunStatus(status: string): { label: string; variant: StatusPillVariant } {
  if (status === 'success') return { label: 'Sucesso', variant: 'success' };
  if (status === 'error') return { label: 'Falhou', variant: 'error' };
  return { label: 'Em andamento', variant: 'info' };
}

/**
 * Traduz o gatilho técnico de uma sincronização para exibição em português.
 */
export function mapTriggerLabel(trigger: string): string {
  if (trigger === 'pull_to_refresh') return 'Pull-to-refresh';
  if (trigger === 'webhook') return 'Webhook';
  if (trigger === 'cron') return 'Rotina diária';
  return 'Manual';
}
