import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: '일기',
  slug: 'ilgi',
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    mockPurchases: process.env.EXPO_PUBLIC_MOCK_PURCHASES === 'true',
    eas: {
      projectId: 'your-eas-project-id',
    },
  },
});
