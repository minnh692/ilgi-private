import { useColorScheme } from 'react-native';
import { palette, typography, spacing, radius, shadow } from './tokens';

export function useTheme() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  const colors = {
    ...palette,
    background: dark ? palette.darkBg : palette.cream,
    surface: dark ? palette.darkSurface : palette.muzzle,
    surfaceAlt: dark ? palette.darkSurface : palette.paper,
    border: dark ? palette.darkBorder : palette.borderGray,
    text: dark ? palette.darkText : palette.inkBrown,
    subtext: dark ? palette.darkSubtext : palette.warmGray,
    placeholder: dark ? palette.darkSubtext : palette.softGray,
    accent: palette.accent,
    accentLight: dark ? palette.accentDark : palette.accentLight,
    error: palette.error,
    errorLight: palette.errorLight,
    tabBar: dark ? palette.darkSurface : palette.muzzle,
    tabBarBorder: dark ? palette.darkBorder : palette.borderGray,
  };

  return {
    colors,
    typography,
    spacing,
    radius,
    shadow,
    dark,
  };
}

export type Theme = ReturnType<typeof useTheme>;
