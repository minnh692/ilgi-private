import { useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { signInWithApple, APPLE_AUTH_MOCK } from '@/lib/appleAuth';
import { useAuthStore } from '@/stores/authStore';
import type { ProfileRow } from '@/types/database';

interface UseAppleSignInResult {
  isLoading: boolean;
  trigger: () => Promise<void>;
}

// Links Sign in with Apple to the current (possibly anonymous) account.
// If the user was anonymous, data is migrated server-side via claim-anonymous-data.
export function useAppleSignIn(onSuccess?: () => void): UseAppleSignInResult {
  const [isLoading, setIsLoading] = useState(false);
  const { user: currentUser, setSession, setProfile } = useAuthStore();

  async function trigger() {
    setIsLoading(true);
    try {
      const anonymousUserId = currentUser?.is_anonymous ? currentUser.id : null;

      if (APPLE_AUTH_MOCK) {
        // In Expo Go: skip real Apple sign-in, just mark the account as linked
        const now = new Date().toISOString();
        const { data: updated } = await supabase
          .from('profiles')
          .update({ onboarding_state: { appleLinked: true, linkedAt: now } })
          .eq('id', currentUser!.id)
          .select()
          .maybeSingle();

        if (updated) setProfile(updated as ProfileRow);

        Alert.alert(
          'Apple 계정 연결 (개발 모드)',
          'Expo Go에서는 실제 Apple 로그인을 사용할 수 없어요. 출시 빌드에서 작동해요.',
        );
        onSuccess?.();
        return;
      }

      // Real Apple sign-in
      const credential = await signInWithApple();

      // Sign in with Apple identity token — this creates or retrieves the Apple user
      const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (authError) throw authError;

      const newUser = authData.session?.user;
      if (!newUser) throw new Error('No user after Apple sign-in');

      setSession(authData.session);

      // If the user switched from anonymous to a new Apple ID, migrate data
      if (anonymousUserId && anonymousUserId !== newUser.id) {
        const { error: claimError } = await supabase.functions.invoke('claim-anonymous-data', {
          body: { anonymousUserId },
        });
        if (claimError) {
          console.error('claim-anonymous-data failed:', claimError);
          // Non-fatal: user is logged in but data may not be migrated
          Alert.alert(
            '데이터 이전 오류',
            '로그인은 됐지만 이전 일기를 옮기지 못했어요. 고객센터에 문의해 주세요.',
          );
        }
      }

      // Load updated profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', newUser.id)
        .maybeSingle();

      if (profile) setProfile(profile as ProfileRow);

      onSuccess?.();
    } catch (err: unknown) {
      const isUserCancel = (e: unknown) =>
        typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === '1001';
      if (!isUserCancel(err)) {
        Alert.alert('로그인 오류', 'Apple 로그인 중 문제가 생겼어요. 다시 시도해 주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return { isLoading, trigger };
}
