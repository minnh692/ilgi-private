import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { needsConsent } from '@/lib/consent';

export default function Index() {
  const { session, user, profile, isLoading } = useAuthStore();

  if (isLoading) return null;

  // Signed out → choose a social login or start anonymously
  if (!session) return <Redirect href="/login" />;

  // Consent screen until the user has agreed (or, anonymous only, chose private-only mode)
  if (!profile || needsConsent(user, profile)) return <Redirect href="/onboarding" />;

  return <Redirect href="/(tabs)/diary" />;
}
