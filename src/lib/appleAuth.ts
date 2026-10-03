import { Platform } from 'react-native';
import Constants from 'expo-constants';

const isExpoGo = Constants.appOwnership === 'expo';
export const APPLE_AUTH_MOCK = isExpoGo || Platform.OS !== 'ios';

export interface AppleCredential {
  identityToken: string;
  user: string;
  email: string | null;
  givenName: string | null;
  familyName: string | null;
}

export async function signInWithApple(): Promise<AppleCredential> {
  if (APPLE_AUTH_MOCK) {
    // Stable mock user id so repeated sign-ins return the same "user"
    const mockUserId = 'mock.apple.user.001';
    return {
      identityToken: `mock-token-${mockUserId}`,
      user: mockUserId,
      email: 'mock@test.com',
      givenName: '테스트',
      familyName: '사용자',
    };
  }

  const AppleAuthentication = await import('expo-apple-authentication');
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) throw new Error('Apple sign-in: no identity token');

  return {
    identityToken: credential.identityToken,
    user: credential.user,
    email: credential.email ?? null,
    givenName: credential.fullName?.givenName ?? null,
    familyName: credential.fullName?.familyName ?? null,
  };
}

export async function isAppleAuthAvailable(): Promise<boolean> {
  if (APPLE_AUTH_MOCK) return true;
  try {
    const AppleAuthentication = await import('expo-apple-authentication');
    return AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}
