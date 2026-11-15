import type { User } from '@supabase/supabase-js';
import type { Database } from '../types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

export interface OnboardingState {
  privacyOnly?: boolean;
  termsAgreedAt?: string;
  /** When the user answered the optional marketing consent (onboarding or the one-time prompt) */
  marketingPromptedAt?: string;
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

/**
 * Confirmation shown right after a user opts in to marketing messages: who sends them, when the
 * user agreed, what they agreed to, and how to opt out (Network Act enforcement decree art. 62-2).
 */
export function marketingConsentNotice(consentedAt: string, nightConsented: boolean): string {
  const d = new Date(consentedAt);
  const date = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  return [
    `${date}에 무늬의 광고성 정보(앱 알림) 수신에 동의했어요.`,
    `야간(오후 9시~오전 8시) 수신: ${nightConsented ? '동의' : '동의 안 함'}`,
    '',
    '설정 > 알림에서 언제든 끌 수 있어요.',
  ].join('\n');
}
