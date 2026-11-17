/**
 * Formatadores monetários (BRL) e temporais no fuso America/Sao_Paulo.
 */

export const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';

const MONTHS_FULL_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

const MONTHS_SHORT_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const;

const WEEKDAYS_PT = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function sanitizeMoney(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) {
    return 0;
  }
  return value;
}

/**
 * Formata um valor em Reais brasileiros sem espaço não-quebrável inconsistente.
 */
export function formatBRL(
  value: number,
  options?: { absolute?: boolean; hideSymbol?: boolean },
): string {
  const safe = sanitizeMoney(value);
  const absFormatted = brlFormatter.format(Math.abs(safe));
  const prefix = options?.hideSymbol ? '' : 'R$ ';
  if (safe < 0 && !options?.absolute) {
    return `-${prefix}${absFormatted}`;
  }
  return `${prefix}${absFormatted}`;
}

/**
 * Formata valor monetário com sinal explícito (+ R$ / - R$ / R$ 0,00).
 */
export function formatSignedBRL(value: number): string {
  const safe = sanitizeMoney(value);
  const absFormatted = brlFormatter.format(Math.abs(safe));
  if (safe > 0) return `+ R$ ${absFormatted}`;
  if (safe < 0) return `- R$ ${absFormatted}`;
  return `R$ ${absFormatted}`;
}

/**
 * Formata um valor mascarado para o modo de privacidade (Olho ativado).
 */
export function formatMaskedBRL(
  value: number,
  options?: { signed?: boolean; hideSymbol?: boolean },
): string {
  const safe = sanitizeMoney(value);
  const prefix = options?.hideSymbol ? '' : 'R$ ';
  if (options?.signed) {
    if (safe > 0) return `+ ${prefix}••••`;
    if (safe < 0) return `- ${prefix}••••`;
  } else if (safe < 0) {
    return `-${prefix}••••`;
  }
  return `${prefix}••••`;
}

/**
 * Formata valor monetário respeitando a flag de privacidade (`hidden`).
 */
export function formatPrivacyBRL(
  value: number,
  hidden: boolean,
  options?: { absolute?: boolean; hideSymbol?: boolean; signed?: boolean },
): string {
  if (hidden) {
    return formatMaskedBRL(options?.absolute ? Math.abs(value) : value, {
      signed: options?.signed,
      hideSymbol: options?.hideSymbol,
    });
  }
  if (options?.signed) {
    return formatSignedBRL(value);
  }
  return formatBRL(value, {
    absolute: options?.absolute,
    hideSymbol: options?.hideSymbol,
  });
}

/**
 * Formata porcentagem em padrão brasileiro (ex.: 35,6%).
 */
export function formatPercent(value: number, decimals = 1): string {
  const safe = Number.isFinite(value) ? value : 0;
  const fixed = Number(safe.toFixed(decimals));
  const usedDecimals = Number.isInteger(fixed) ? 0 : decimals;
  return `${fixed.toFixed(usedDecimals).replace('.', ',')}%`;
}

/**
 * Valida e separa chave YYYY-MM em ano e mês [1..12].
 */
export function parseYearMonth(monthKey: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!match) {
    throw new Error(`Mês inválido (esperado YYYY-MM): ${monthKey}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Mês fora do intervalo 01..12: ${monthKey}`);
  }
  return { year, month };
}

/**
 * Soma ou subtrai meses mantendo formato YYYY-MM sem desvios de fuso horário.
 */
export function shiftYearMonth(monthKey: string, deltaMonths: number): string {
  const { year, month } = parseYearMonth(monthKey);
  const totalMonths = year * 12 + (month - 1) + deltaMonths;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = ((totalMonths % 12) + 12) % 12;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth + 1).padStart(2, '0')}`;
}

const spPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SAO_PAULO_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Extrai componentes de calendário no fuso America/Sao_Paulo.
 */
export function getDatePartsSP(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekdayIndex: number;
  dateKey: string;
} {
  const parts = spPartsFormatter.formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let yearStr = '0000';
  let monthStr = '00';
  let dayStr = '00';

  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    if (p.type === 'year') {
      yearStr = p.value;
      year = Number(p.value);
    } else if (p.type === 'month') {
      monthStr = p.value;
      month = Number(p.value);
    } else if (p.type === 'day') {
      dayStr = p.value;
      day = Number(p.value);
    } else if (p.type === 'hour') {
      hour = Number(p.value);
    } else if (p.type === 'minute') {
      minute = Number(p.value);
    }
  }

  const daysSinceEpoch = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  const weekdayIndex = ((daysSinceEpoch + 4) % 7 + 7) % 7;
  const dateKey = `${yearStr}-${monthStr}-${dayStr}`;

  return { year, month, day, hour, minute, weekdayIndex, dateKey };
}

/**
 * Retorna o mês corrente (YYYY-MM) no fuso America/Sao_Paulo.
 */
export function getCurrentMonthSP(now = new Date()): string {
  const { year, month } = getDatePartsSP(now);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/**
 * Formata chave YYYY-MM para exibição (ex.: "Abril 2026" ou "Abr 2026").
 */
export function formatMonthLabel(monthKey: string, short = false): string {
  const { year, month } = parseYearMonth(monthKey);
  const name = short ? MONTHS_SHORT_PT[month - 1] : MONTHS_FULL_PT[month - 1];
  return `${name} ${year}`;
}

/**
 * Formata data ISO para agrupamento diário (Hoje · 11 Nov, Ontem · 10 Nov, etc.) em America/Sao_Paulo.
 */
export function formatDayGroupLabel(isoDate: string, now = new Date()): string {
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) {
    return isoDate;
  }
  const targetParts = getDatePartsSP(target);
  const todayParts = getDatePartsSP(now);

  const targetDayUtc = Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day);
  const todayDayUtc = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);
  const diffDays = Math.round((todayDayUtc - targetDayUtc) / 86_400_000);

  const dayStr = String(targetParts.day).padStart(2, '0');
  const shortMonth = MONTHS_SHORT_PT[targetParts.month - 1];

  if (diffDays === 0) return `Hoje · ${dayStr} ${shortMonth}`;
  if (diffDays === 1) return `Ontem · ${dayStr} ${shortMonth}`;
  return `${WEEKDAYS_PT[targetParts.weekdayIndex]}, ${dayStr} ${shortMonth}`;
}

/**
 * Formata hora HH:mm no fuso America/Sao_Paulo.
 */
export function formatTimeSP(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  const { hour, minute } = getDatePartsSP(date);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Formata timestamp de última sincronização de forma amigável em português.
 */
export function formatSyncRelative(isoDate: string | null | undefined, now = new Date()): string {
  if (!isoDate) return 'Nunca sincronizado';
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return 'Sincronização desconhecida';

  const diffMs = Math.max(0, now.getTime() - target.getTime());
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return 'Sincronizado agora';
  if (diffMinutes < 60) return `Há ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Há ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? 'Há 1 dia' : `Há ${diffDays} dias`;
}
