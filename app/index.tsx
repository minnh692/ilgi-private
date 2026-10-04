import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function Index() {
  const { session, profile, isLoading } = useAuthStore();

  if (isLoading) return null;

  // Signed out → choose a social login or start anonymously
  if (!session) return <Redirect href="/login" />;

  // Onboarding is done once the user either consented or chose private-only mode
  const privacyOnly = (profile?.onboarding_state as { privacyOnly?: boolean } | null)?.privacyOnly === true;
  if (!profile?.consent_ai_at && !profile?.consent_sensitive_at && !privacyOnly) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)/diary" />;
}
