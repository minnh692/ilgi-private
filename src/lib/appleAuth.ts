import * as AppleAuthentication from 'expo-apple-authentication';

export interface AppleCredential {
  identityToken: string;
  user: string;
}

/** Native Sign in with Apple (iOS only). Throws with code ERR_REQUEST_CANCELED if the user closes the sheet. */
export async function signInWithApple(): Promise<AppleCredential> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) throw new Error('Apple sign-in: no identity token');
  return { identityToken: credential.identityToken, user: credential.user };
}
