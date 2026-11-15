import { ExpoConfig, ConfigContext } from 'expo/config';

// EAS cloud builds don't get .env.local — the values must come from EAS environment variables.
// Fail the build here instead of shipping an app that crashes on launch (see src/lib/supabase.ts).
if (process.env.EAS_BUILD === 'true') {
  const missing = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing EAS environment variables: ${missing.join(', ')} (eas env:create)`);
  }
  if (
    process.env.EAS_BUILD_PROFILE === 'production' &&
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.startsWith('test_')
  ) {
    throw new Error('Production build must not use a RevenueCat test_ key');
  }
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: '무늬AI',
  slug: 'ilgi',
  extra: {
    ...config.extra,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    mockPurchases: process.env.EXPO_PUBLIC_MOCK_PURCHASES === 'true',
  },
});
