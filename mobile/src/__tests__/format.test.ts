/// <reference types="jest" />

import {
  formatBRL,
  formatDayGroupLabel,
  formatMonthLabel,
  formatPercent,
  formatSignedBRL,
  formatSyncRelative,
  formatTimeSP,
  getCurrentMonthSP,
  shiftYearMonth,
} from '../utils/format';

describe('Formatadores monetários e temporais SP', () => {
  it('formata BRL positivo, negativo e elimina -0,00', () => {
    expect(formatBRL(1234.5)).toBe('R$ 1.234,50');
    expect(formatBRL(-48.9)).toBe('-R$ 48,90');
    expect(formatBRL(-48.9, { absolute: true })).toBe('R$ 48,90');
    expect(formatBRL(-0)).toBe('R$ 0,00');
    expect(formatBRL(-0.001)).toBe('R$ 0,00');
    expect(formatBRL(100, { hideSymbol: true })).toBe('100,00');
  });

  it('formata valores assinados corretamente', () => {
    expect(formatSignedBRL(6120)).toBe('+ R$ 6.120,00');
    expect(formatSignedBRL(-318.29)).toBe('- R$ 318,29');
    expect(formatSignedBRL(-0)).toBe('R$ 0,00');
  });

  it('formata percentuais sem zeros redundantes', () => {
    expect(formatPercent(41.25, 1)).toBe('41,3%');
    expect(formatPercent(35.0, 1)).toBe('35%');
  });

  it('navega meses YYYY-MM atravessando viradas de ano', () => {
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftYearMonth('2026-12', 1)).toBe('2027-01');
    expect(formatMonthLabel('2026-04')).toBe('Abril 2026');
    expect(formatMonthLabel('2026-11', true)).toBe('Nov 2026');
    expect(() => shiftYearMonth('2026-13', 1)).toThrow();
  });

  it('respeita o fuso America/Sao_Paulo nas fronteiras de dia e mês', () => {
    // 2026-11-01T01:30:00Z equivale a 2026-10-31 22:30 em São Paulo (UTC-3)
    const boundary = new Date('2026-11-01T01:30:00.000Z');
    expect(getCurrentMonthSP(boundary)).toBe('2026-10');
    expect(formatTimeSP('2026-11-01T01:30:00.000Z')).toBe('22:30');

    const nowSP = new Date('2026-11-11T15:00:00.000Z');
    expect(formatDayGroupLabel('2026-11-11T23:45:00.000Z', nowSP)).toBe('Hoje · 11 Nov');
    expect(formatDayGroupLabel('2026-11-11T01:45:00.000Z', nowSP)).toBe('Ontem · 10 Nov');
  });

  it('formata status relativo de sincronização', () => {
    const now = new Date('2026-11-11T18:00:00.000Z');
    expect(formatSyncRelative(null, now)).toBe('Nunca sincronizado');
    expect(formatSyncRelative('2026-11-11T17:59:40.000Z', now)).toBe('Sincronizado agora');
    expect(formatSyncRelative('2026-11-11T17:45:00.000Z', now)).toBe('Há 15 min');
    expect(formatSyncRelative('2026-11-11T15:00:00.000Z', now)).toBe('Há 3 h');
    expect(formatSyncRelative('2026-11-09T18:00:00.000Z', now)).toBe('Há 2 dias');
  });
});
