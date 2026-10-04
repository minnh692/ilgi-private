// 무늬 cat brand
export const brand = {
  ink: '#3A2E2A',     // outlines, primary text
  cheese: '#F4A259',  // fur — main brand fill
  stripe: '#D97B3C',  // tabby stripes — interactive accent
  cream: '#FBF1E4',   // app background
  muzzle: '#FFF6EA',  // card surfaces
  blush: '#F7B7A3',   // soft highlights
  nose: '#E0786A',    // small pops of warmth
} as const;

export const palette = {
  ...brand,

  // Warm paper-like base
  paper: brand.muzzle,
  parchment: '#F3E3CE',

  // Warm earth tones
  inkBrown: brand.ink,
  warmGray: '#7A6A62',
  softGray: '#B3A398',
  borderGray: '#EADBC8',

  // Accent — stripe orange for interactive elements, cheese tint for soft fills
  accent: brand.stripe,
  accentLight: '#FCE3C6',
  accentDark: '#8A4A22',

  // Mood dots
  moodJoy: '#F4C842',
  moodCalm: '#7EC8A4',
  moodSad: '#7EB5D4',
  moodAngry: brand.nose,
  moodAnxious: '#C39BD3',

  // Utility
  white: '#FFFFFF',
  black: '#1A1008',
  error: '#C0392B',
  errorLight: '#FAE5E3',
  success: '#2E7D52',

  // Dark mode overrides applied via colorScheme
  darkBg: '#1E1815',
  darkSurface: '#2B2320',
  darkBorder: '#3F3430',
  darkText: '#F3E8DA',
  darkSubtext: '#A39286',
};

export const typography = {
  fontFamily: {
    regular: 'Pretendard-Regular',
    medium: 'Pretendard-Medium',
    semiBold: 'Pretendard-SemiBold',
    bold: 'Pretendard-Bold',
  },
  size: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
  lineHeight: {
    tight: 1.3,
    normal: 1.6,
    relaxed: 1.8,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const shadow = {
  sm: {
    shadowColor: brand.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: brand.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: brand.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
};
