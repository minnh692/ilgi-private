import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { signInWithApple } from '@/lib/appleAuth';

export type SocialProvider = 'apple' | 'google' | 'kakao';

export const PROVIDER_LABEL: Record<SocialProvider, string> = {
  apple: 'Apple',
  google: 'Google',
  kakao: '카카오',
};

const PROVIDER_ORDER: SocialProvider[] = ['apple', 'google', 'kakao'];

// Which provider this device last signed in with. Supabase doesn't expose it: accounts that share
// an email are linked, so the session alone can't tell a Kakao login from a Google one.
const LAST_PROVIDER_KEY = 'last_sign_in_provider';

export async function getLastSignInProvider(): Promise<SocialProvider | null> {
  try {
    const v = await AsyncStorage.getItem(LAST_PROVIDER_KEY);
    return v === 'apple' || v === 'google' || v === 'kakao' ? v : null;
  } catch {
    return null;
  }
}

export async function clearLastSignInProvider(): Promise<void> {
  try { await AsyncStorage.removeItem(LAST_PROVIDER_KEY); } catch { /* best effort */ }
}

/**
 * Every social provider linked to this account, in display order.
 * Not `app_metadata.provider`: that's only the provider the account was *created* with. Supabase
 * auto-links identities that share a verified email, so e.g. a Kakao login can land on an account
 * first created with Google — the full list lives in `app_metadata.providers` / `identities`.
 */
export function linkedProviders(user: User | null | undefined): SocialProvider[] {
  if (!user) return [];
  const raw = new Set<string>([
    ...((user.app_metadata?.providers as string[] | undefined) ?? []),
    ...(user.identities ?? []).map((i) => i.provider),
  ]);
  return PROVIDER_ORDER.filter((p) => raw.has(p));
}

/** Thrown when the user closes the sign-in sheet — not an error worth surfacing. */
export class SignInCancelled extends Error {
  constructor() {
    super('sign-in cancelled');
  }
}

// Sign in with Apple is native-only; Apple requires offering it on iOS when other social logins exist
export const isAppleSignInSupported = Platform.OS === 'ios';

// Must be listed in Supabase → Authentication → URL Configuration → Redirect URLs
export const OAUTH_REDIRECT_URL = Linking.createURL('auth-callback');
if (__DEV__) console.log('[socialAuth] OAuth redirect URL:', OAUTH_REDIRECT_URL);

async function signInWithAppleNative(): Promise<Session> {
  let identityToken: string;
  try {
    ({ identityToken } = await signInWithApple());
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'ERR_REQUEST_CANCELED' || code === '1001') throw new SignInCancelled();
    throw e;
  }
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken });
  if (error) throw error;
  if (!data.session) throw new Error('No session after Apple sign-in');
  return data.session;
}

// Google / Kakao: Supabase-hosted OAuth in an in-app browser, PKCE code exchanged here
async function signInWithOAuthBrowser(provider: 'google' | 'kakao'): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: OAUTH_REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT_URL);
  if (result.type !== 'success') throw new SignInCancelled();

  const { queryParams } = Linking.parse(result.url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  if (!code) {
    const reason = typeof queryParams?.error_description === 'string' ? queryParams.error_description : 'missing code';
    throw new Error(`OAuth failed: ${reason}`);
  }

  const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return exchanged.session;
}

/**
 * Signs in with a social provider. If the user was anonymous, their diary data is moved
 * onto the signed-in account (proven by the anonymous session's access token).
 * Returns whether that migration failed, so the caller can tell the user.
 */
export async function signInWithProvider(provider: SocialProvider): Promise<{ session: Session; claimFailed: boolean }> {
  const { data: { session: before } } = await supabase.auth.getSession();
  const anonymousToken = before?.user.is_anonymous ? before.access_token : null;
  const anonymousUserId = before?.user.is_anonymous ? before.user.id : null;

  const session = provider === 'apple'
    ? await signInWithAppleNative()
    : await signInWithOAuthBrowser(provider);

  try { await AsyncStorage.setItem(LAST_PROVIDER_KEY, provider); } catch { /* display only */ }

  let claimFailed = false;
  if (anonymousToken && anonymousUserId !== session.user.id) {
    const { error } = await supabase.functions.invoke('claim-anonymous-data', {
      body: { anonymousAccessToken: anonymousToken },
    });
    if (error) {
      console.error('[socialAuth] claim-anonymous-data failed', { provider });
      claimFailed = true;
    }
  }

  return { session, claimFailed };
}
