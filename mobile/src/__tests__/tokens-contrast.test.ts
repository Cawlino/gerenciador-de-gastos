/// <reference types="jest" />
/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  colorToShaderVec4,
  getLiquidGlassEffect,
  LIQUID_GLASS_SKSL,
} from '../shaders/liquidGlassShader';
import { contrastRatio, meetsWcagAA } from '../theme/contrast';
import { COLORS, GLASS_METRICS } from '../theme/tokens';

describe('Design tokens & contraste WCAG AA', () => {
  it('mantém métricas exatas do sistema Liquid Glass', () => {
    expect(COLORS.bg.deep).toBe('#05070D');
    expect(COLORS.bg.mid).toBe('#0B1120');
    expect(COLORS.bg.high).toBe('#111827');
    expect(GLASS_METRICS.refractionStrength).toBe(0.04);
    expect(GLASS_METRICS.chromaticSpread).toBe(0.006);
    expect(GLASS_METRICS.radius).toEqual({ card: 26, row: 18, pill: 999 });
  });

  it('garante contraste >= 4.5:1 para textos primário e secundário sobre fundos e vidros', () => {
    const surfaces = [
      { name: 'bg.deep', bg: COLORS.bg.deep, backdrop: COLORS.bg.deep },
      { name: 'bg.mid', bg: COLORS.bg.mid, backdrop: COLORS.bg.deep },
      { name: 'bg.high', bg: COLORS.bg.high, backdrop: COLORS.bg.deep },
      { name: 'bg.abyss', bg: COLORS.bg.abyss, backdrop: COLORS.bg.abyss },
      { name: 'bg.navy', bg: COLORS.bg.navy, backdrop: COLORS.bg.abyss },
      { name: 'bg.sapphire', bg: COLORS.bg.sapphire, backdrop: COLORS.bg.abyss },
      { name: 'glass.fill/mid', bg: COLORS.glass.fill, backdrop: COLORS.bg.mid },
      { name: 'glass.fill/high', bg: COLORS.glass.fill, backdrop: COLORS.bg.high },
      { name: 'glass.fill/navy', bg: COLORS.glass.fill, backdrop: COLORS.bg.navy },
      { name: 'glass.fill/sapphire', bg: COLORS.glass.fill, backdrop: COLORS.bg.sapphire },
      { name: 'glass.fallbackFill', bg: COLORS.glass.fallbackFill, backdrop: COLORS.bg.abyss },
    ];

    for (const surface of surfaces) {
      const primaryRatio = contrastRatio(COLORS.text.primary, surface.bg, surface.backdrop);
      const secondaryRatio = contrastRatio(COLORS.text.secondary, surface.bg, surface.backdrop);
      expect(meetsWcagAA(primaryRatio)).toBe(true);
      expect(meetsWcagAA(secondaryRatio)).toBe(true);
    }
  });

  it('garante contraste >= 4.5:1 para cores semânticas de receita, despesa, ciano e ice-blue', () => {
    for (const accent of [
      COLORS.semantic.income,
      COLORS.semantic.expense,
      COLORS.neon.cyan,
      COLORS.accent.ice,
    ]) {
      const ratio = contrastRatio(accent, COLORS.glass.fill, COLORS.bg.sapphire);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('Shader SkSL Liquid Glass', () => {
  it('mantém liquid_glass.sksl sincronizado com a string embarcada', () => {
    const diskSksl = readFileSync(
      resolve(__dirname, '../shaders/liquid_glass.sksl'),
      'utf8',
    )
      .replace(/\r\n/g, '\n')
      .trim();

    expect(diskSksl).toBe(LIQUID_GLASS_SKSL.replace(/\r\n/g, '\n').trim());
    expect(diskSksl).toContain('uniform shader backdrop;');
    expect(diskSksl).toContain('uniform float2 uSize;');
    expect(diskSksl).toContain('uniform float uRadius;');
    expect(diskSksl).toContain('uniform float uRefraction;');
    expect(diskSksl).toContain('uniform float uChromatic;');
    expect(diskSksl).toContain('uniform float4 uTint;');
    expect(diskSksl).toContain('sdRoundedRect');
    expect(diskSksl).toContain('safeNormal');
  });

  it('compila via Skia.RuntimeEffect.Make e converte tint RGBA para vec4', () => {
    const effect = getLiquidGlassEffect();
    expect(effect).not.toBeNull();
    expect(colorToShaderVec4('rgba(255, 255, 255, 0.06)')).toEqual([1, 1, 1, 0.06]);
    expect(colorToShaderVec4('#22D3EE')).toEqual([
      0x22 / 255,
      0xd3 / 255,
      0xee / 255,
      1,
    ]);
  });
});
