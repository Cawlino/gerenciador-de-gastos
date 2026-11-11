/**
 * Design tokens do Design System "Liquid Glass Skia" (Dark Neon / Glassmorphism).
 */
export const COLORS = {
  bg: {
    deep: '#05070D',
    mid: '#0B1120',
    high: '#111827',
  },
  orb: {
    cyan: 'rgba(34, 211, 238, 0.22)',
    purple: 'rgba(168, 85, 247, 0.20)',
    mint: 'rgba(52, 211, 153, 0.18)',
    cyanSolid: '#22D3EE',
    purpleSolid: '#A855F7',
    mintSolid: '#34D399',
  },
  glass: {
    fill: 'rgba(255, 255, 255, 0.06)',
    fillElevated: 'rgba(255, 255, 255, 0.09)',
    fillSubtle: 'rgba(255, 255, 255, 0.04)',
    fallbackFill: 'rgba(17, 24, 39, 0.78)',
    strokeStart: 'rgba(255, 255, 255, 0.22)',
    strokeEnd: 'rgba(255, 255, 255, 0.04)',
    tintCyan: 'rgba(34, 211, 238, 0.09)',
    tintPurple: 'rgba(168, 85, 247, 0.09)',
    tintMint: 'rgba(52, 211, 153, 0.09)',
  },
  neon: {
    cyan: '#22D3EE',
    purple: '#A855F7',
    mint: '#34D399',
  },
  semantic: {
    income: '#34D399',
    expense: '#FB7185',
    warning: '#FBBF24',
    error: '#FB7185',
    info: '#22D3EE',
    muted: '#8B97AD',
  },
  text: {
    primary: '#E6EDF7',
    secondary: '#8B97AD',
    inverse: '#05070D',
  },
} as const;

export const GLASS_METRICS = {
  refractionStrength: 0.04,
  chromaticSpread: 0.006,
  blurSigma: 22,
  strokeWidth: 1,
  radius: {
    card: 26,
    row: 18,
    pill: 999,
  },
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const TYPOGRAPHY = {
  family: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  size: {
    hero: 34,
    title: 22,
    section: 17,
    body: 15,
    caption: 13,
    micro: 11,
  },
  lineHeight: {
    hero: 40,
    title: 28,
    section: 22,
    body: 20,
    caption: 18,
    micro: 14,
  },
} as const;

export const DONUT_PALETTE = [
  '#22D3EE',
  '#A855F7',
  '#34D399',
  '#FB7185',
  '#FBBF24',
  '#60A5FA',
  '#F472B6',
  '#818CF8',
] as const;

export const TAB_BAR_CLEARANCE = 108;
