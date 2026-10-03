export const palette = {
  // Warm paper-like base
  cream: '#F7F3EC',
  paper: '#F2EDE3',
  parchment: '#EBE4D6',

  // Warm earth tones
  inkBrown: '#3D2B1F',
  warmGray: '#7A6B60',
  softGray: '#B0A49A',
  borderGray: '#DDD5CA',

  // Accent — muted terracotta
  accent: '#C8795A',
  accentLight: '#F0D5C8',
  accentDark: '#A05A40',

  // Mood dots
  moodJoy: '#F4C842',
  moodCalm: '#7EC8A4',
  moodSad: '#7EB5D4',
  moodAngry: '#E07A5F',
  moodAnxious: '#C39BD3',

  // Utility
  white: '#FFFFFF',
  black: '#1A1008',
  error: '#C0392B',
  errorLight: '#FAE5E3',
  success: '#2E7D52',

  // Dark mode overrides applied via colorScheme
  darkBg: '#1C1810',
  darkSurface: '#2A2318',
  darkBorder: '#3D3328',
  darkText: '#EDE6D8',
  darkSubtext: '#9E9080',
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
    shadowColor: '#3D2B1F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#3D2B1F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#3D2B1F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
};
