import { Redirect } from 'expo-router';

// OAuth redirect target (munui://auth-callback). The in-app browser normally captures it and
// lib/socialAuth.ts exchanges the code; if the OS routes the link here instead, just go home.
export default function AuthCallback() {
  return <Redirect href="/" />;
}
