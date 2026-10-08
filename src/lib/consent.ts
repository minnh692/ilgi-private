import type { User } from '@supabase/supabase-js';
import type { Database } from '../types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

export interface OnboardingState {
  privacyOnly?: boolean;
  termsAgreedAt?: string;
  [key: string]: unknown;
}

export function onboardingState(profile: Profile | null): OnboardingState {
  return (profile?.onboarding_state as OnboardingState | null) ?? {};
}

/**
 * Whether the user has to go through the consent screen before using the app.
 * Signed-in (social) accounts must accept the terms and the required consents. Anonymous users may
 * instead start in private-only mode ("동의하지 않고 시작") without AI consents.
 * Returns false while the profile for the current user hasn't loaded yet.
 */
export function needsConsent(user: User | null, profile: Profile | null): boolean {
  if (!user || !profile || profile.id !== user.id) return false;
  const state = onboardingState(profile);
  if (!user.is_anonymous) return !profile.consent_ai_at || !state.termsAgreedAt;
  return !profile.consent_ai_at && !profile.consent_sensitive_at && !state.privacyOnly;
}
