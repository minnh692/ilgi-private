import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';

export default function Index() {
  const { session, profile, isLoading } = useAuthStore();

  useEffect(() => {
    // Silent anonymous sign-in on first launch
    if (!isLoading && !session) {
      supabase.auth.signInAnonymously().catch(console.error);
    }
  }, [session, isLoading]);

  if (isLoading) return null;

  // First launch: no profile means onboarding not complete
  if (!profile?.consent_ai_at && !profile?.consent_sensitive_at) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)/diary" />;
}
