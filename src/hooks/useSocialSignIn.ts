import { useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { signInWithProvider, SignInCancelled, PROVIDER_LABEL, type SocialProvider } from '@/lib/socialAuth';
import { useAuthStore } from '@/stores/authStore';

interface UseSocialSignInResult {
  /** Provider whose sign-in is in flight, or null */
  pending: SocialProvider | null;
  /** Resolves true when signed in (store updated), false on cancel/failure */
  signIn: (provider: SocialProvider) => Promise<boolean>;
}

export function useSocialSignIn(): UseSocialSignInResult {
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const setSession = useAuthStore((s) => s.setSession);
  const setProfile = useAuthStore((s) => s.setProfile);

  async function signIn(provider: SocialProvider): Promise<boolean> {
    setPending(provider);
    try {
      const { session, claimFailed } = await signInWithProvider(provider);
      setSession(session);

      const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      setProfile(profile ?? null);

      if (claimFailed) {
        Alert.alert('데이터 이전 오류', '로그인은 됐지만 이전 일기를 옮기지 못했어요. 고객센터에 문의해 주세요.');
      }
      return true;
    } catch (e) {
      if (!(e instanceof SignInCancelled)) {
        // Auth errors describe the sign-in problem (config, token), never diary content
        const err = e as { name?: string; code?: string; status?: number; message?: string };
        console.error('[useSocialSignIn] sign-in failed', {
          provider, name: err?.name, code: err?.code, status: err?.status, message: err?.message,
        });
        Alert.alert('로그인 오류', `${PROVIDER_LABEL[provider]} 로그인 중 문제가 생겼어요. 다시 시도해 주세요.`);
      }
      return false;
    } finally {
      setPending(null);
    }
  }

  return { pending, signIn };
}
