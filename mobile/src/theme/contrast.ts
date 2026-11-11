/**
 * Utilitários de luminância relativa e razão de contraste WCAG 2.1.
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface RgbaColor extends RgbColor {
  a: number;
}

/**
 * Converte cor hexadecimal (#RGB ou #RRGGBB) para canais sRGB [0..255].
 */
export function parseHexColor(hex: string): RgbColor {
  const clean = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }
  throw new Error(`Cor hexadecimal inválida: ${hex}`);
}

/**
 * Converte string rgb(...) ou rgba(...) para canais [0..255] + alfa [0..1].
 */
export function parseRgbaColor(color: string): RgbaColor {
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) {
    return { ...parseHexColor(trimmed), a: 1 };
  }
  const match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(
    trimmed,
  );
  if (!match) {
    throw new Error(`Formato de cor não suportado: ${color}`);
  }
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] !== undefined ? Number(match[4]) : 1,
  };
}

/**
 * Compõe uma cor possivelmente translúcida sobre um fundo opaco.
 */
export function compositeOver(foreground: string, backdropHex: string): RgbColor {
  const fg = parseRgbaColor(foreground);
  const bg = parseHexColor(backdropHex);
  const invA = 1 - fg.a;
  return {
    r: Math.round(fg.r * fg.a + bg.r * invA),
    g: Math.round(fg.g * fg.a + bg.g * invA),
    b: Math.round(fg.b * fg.a + bg.b * invA),
  };
}

function linearizeChannel(channel255: number): number {
  const s = channel255 / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Calcula luminância relativa segundo WCAG 2.1 (entre 0 e 1).
 */
export function relativeLuminance(rgb: RgbColor): number {
  return (
    0.2126 * linearizeChannel(rgb.r) +
    0.7152 * linearizeChannel(rgb.g) +
    0.0722 * linearizeChannel(rgb.b)
  );
}

/**
 * Calcula a razão de contraste WCAG entre primer plano e fundo (1..21).
 */
export function contrastRatio(
  foreground: string,
  background: string,
  backdropHex = '#05070D',
): number {
  const bgRgb = background.trim().startsWith('rgb')
    ? compositeOver(background, backdropHex)
    : parseHexColor(background);
  const fgRgb = foreground.trim().startsWith('rgb')
    ? compositeOver(foreground, backdropHex)
    : parseHexColor(foreground);

  const lumA = relativeLuminance(fgRgb);
  const lumB = relativeLuminance(bgRgb);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Verifica conformidade WCAG AA (>= 4.5 para texto normal, >= 3.0 para texto grande).
 */
export function meetsWcagAA(ratio: number, largeText = false): boolean {
  return ratio >= (largeText ? 3.0 : 4.5);
}
