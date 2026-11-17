/**
 * Design tokens do Design System "Liquid Glass Skia" (Dark Neon / Glassmorphism).
 */
export const COLORS = {
  bg: {
    deep: '#05070D',
    mid: '#0B1120',
    high: '#111827',
    abyss: '#040916',
    navy: '#07132B',
    sapphire: '#0C214A',
    oceanTop: '#0E397F',
    oceanMid: '#08214D',
    oceanFade: '#030B1D',
    pureBlack: '#000000',
  },
  orb: {
    cyan: 'rgba(34, 211, 238, 0.22)',
    purple: 'rgba(168, 85, 247, 0.20)',
    mint: 'rgba(52, 211, 153, 0.18)',
    cyanSolid: '#22D3EE',
    purpleSolid: '#A855F7',
    mintSolid: '#34D399',
    sapphireGlow: 'rgba(37, 99, 235, 0.24)',
    iceGlow: 'rgba(56, 189, 248, 0.09)',
  },
  glass: {
    fill: 'rgba(255, 255, 255, 0.05)',
    fillElevated: 'rgba(255, 255, 255, 0.08)',
    fillSubtle: 'rgba(255, 255, 255, 0.03)',
    fallbackFill: 'rgba(8, 21, 48, 0.84)',
    liquidTint: 'rgba(10, 24, 54, 0.24)',
    liquidTintElevated: 'rgba(14, 32, 70, 0.30)',
    liquidTintControl: 'rgba(12, 28, 62, 0.32)',
    hairline: 'rgba(255, 255, 255, 0.14)',
    hairlineSubtle: 'rgba(255, 255, 255, 0.09)',
    activePill: 'rgba(255, 255, 255, 0.14)',
    activeStroke: 'rgba(255, 255, 255, 0.28)',
    strokeStart: 'rgba(255, 255, 255, 0.20)',
    strokeEnd: 'rgba(255, 255, 255, 0.04)',
    bevelOuter: 'rgba(224, 242, 255, 0.44)',
    bevelInner: 'rgba(130, 195, 255, 0.24)',
    bevelCyan: 'rgba(100, 215, 255, 0.34)',
    tintCyan: 'rgba(34, 211, 238, 0.09)',
    tintPurple: 'rgba(168, 85, 247, 0.09)',
    tintMint: 'rgba(52, 211, 153, 0.09)',
  },
  accent: {
    ice: '#38BDF8',
    iceTint: 'rgba(56, 189, 248, 0.14)',
    iceBorder: 'rgba(56, 189, 248, 0.36)',
    sapphire: '#2563EB',
    sapphireTint: 'rgba(37, 99, 235, 0.24)',
    expenseTint: 'rgba(251, 113, 133, 0.18)',
    expenseBorder: 'rgba(251, 113, 133, 0.38)',
    incomeTint: 'rgba(52, 211, 153, 0.16)',
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
    info: '#38BDF8',
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
    regular: 'PlusJakartaSans_400Regular',
    medium: 'PlusJakartaSans_500Medium',
    semibold: 'PlusJakartaSans_600SemiBold',
    bold: 'PlusJakartaSans_700Bold',
    display: 'SpaceGrotesk_700Bold',
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
