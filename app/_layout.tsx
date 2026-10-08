import { useEffect, useRef, useState } from 'react';
import { AppState, View, Text, StyleSheet, Pressable } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';

import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useProfile } from '@/hooks/useProfile';
import { palette } from '@/theme/tokens';
import { useFonts } from '@/hooks/useFonts';
import { configurePurchases, loginPurchasesUser } from '@/lib/purchases';
import { needsConsent } from '@/lib/consent';
import { isLockEnabled, authenticate } from '@/lib/appLock';
import LockArt from '../assets/brand/svg/muni-lock.svg';

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const scheme = useColorScheme();
  const bg = scheme === 'dark' ? palette.darkBg : palette.cream;
  const textColor = scheme === 'dark' ? palette.darkText : palette.ink;
  const subColor = scheme === 'dark' ? palette.darkSubtext : palette.warmGray;
  const accentColor = palette.accent;

  async function handleUnlock() {
    const ok = await authenticate();
    if (ok) onUnlock();
  }

  return (
    <SafeAreaView style={[lockStyles.container, { backgroundColor: bg }]} edges={['top', 'bottom']}>
      <LockArt width={120} height={120} accessibilityElementsHidden importantForAccessibility="no" />
      <Text style={[lockStyles.title, { color: textColor }]}>일기 잠금</Text>
      <Text style={[lockStyles.subtitle, { color: subColor }]}>계속하려면 인증해 주세요</Text>
      <Pressable
        onPress={handleUnlock}
        style={[lockStyles.btn, { backgroundColor: accentColor }]}
        accessibilityRole="button"
        accessibilityLabel="잠금 해제"
      >
        <Text style={lockStyles.btnText}>잠금 해제</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const lockStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontSize: 22, fontWeight: '600' },
  subtitle: { fontSize: 15, marginBottom: 12 },
  btn: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 14 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

// Screens a signed-out user may stay on (index redirects on its own)
const SIGNED_OUT_SEGMENTS = new Set(['login', 'auth-callback', 'legal']);
// Screens a user who still has to consent may stay on
const CONSENT_SEGMENTS = new Set(['onboarding', 'login', 'auth-callback', 'legal']);

function AuthGate({ children }: { children: React.ReactNode }) {
  useProfile();
  const userId = useAuthStore((s) => s.user?.id);
  const hasSession = useAuthStore((s) => !!s.session);
  const authLoading = useAuthStore((s) => s.isLoading);
  const segments = useSegments();

  // Single auth guard: whenever there's no session (sign-out, expired/revoked session),
  // leave whatever screen is open — e.g. settings — and go to the login screen
  const firstSegment = segments[0] as string | undefined;
  useEffect(() => {
    if (authLoading || hasSession) return;
    if (firstSegment === undefined || SIGNED_OUT_SEGMENTS.has(firstSegment)) return;
    if (router.canDismiss()) router.dismissAll();
    router.replace('/login');
  }, [authLoading, hasSession, firstSegment]);

  // Consent guard: a signed-in account without the required consents (fresh social login, an
  // anonymous account just linked, or an older account) goes to the consent screen from anywhere
  const mustConsent = useAuthStore((s) => !s.isLoading && needsConsent(s.user, s.profile));
  useEffect(() => {
    if (!mustConsent) return;
    if (firstSegment === undefined || CONSENT_SEGMENTS.has(firstSegment)) return;
    if (router.canDismiss()) router.dismissAll();
    router.replace('/onboarding');
  }, [mustConsent, firstSegment]);
  const [isLocked, setIsLocked] = useState(false);
  const appState = useRef(AppState.currentState);
  const lastBackground = useRef<number | null>(null);

  useEffect(() => {
    if (userId) loginPurchasesUser(userId);
  }, [userId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (appState.current.match(/active/) && nextState.match(/inactive|background/)) {
        lastBackground.current = Date.now();
      }

      if (nextState === 'active' && appState.current.match(/inactive|background/)) {
        const elapsed = lastBackground.current ? Date.now() - lastBackground.current : 0;
        if (elapsed > 5000) {
          const enabled = await isLockEnabled();
          if (enabled) {
            setIsLocked(true);
            const ok = await authenticate();
            if (ok) setIsLocked(false);
          }
        }
      }

      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  if (isLocked) {
    return <LockScreen onUnlock={() => setIsLocked(false)} />;
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const { setSession, setLoading } = useAuthStore();
  const fontsLoaded = useFonts();

  useEffect(() => {
    configurePurchases();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) {
        setLoading(false);
        return;
      }
      // A stored session can outlive its user (e.g. account deleted on another device, or by an
      // older build that didn't sign out). Verify it with the server and drop it if the user is
      // gone; network errors (no status) keep the session so offline launches still work.
      supabase.auth.getUser().then(({ error }) => {
        if (error && (error.status === 401 || error.status === 403 || error.code === 'user_not_found')) {
          supabase.auth.signOut({ scope: 'local' });
        }
      });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [setSession, setLoading]);

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <AuthGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: {
                  backgroundColor: scheme === 'dark' ? palette.darkBg : palette.cream,
                },
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="write"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="entry/[id]"
                options={{ animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="entry/edit/[id]"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="paywall"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="settings"
                options={{ animation: 'slide_from_right' }}
              />
              <Stack.Screen name="login" />
              <Stack.Screen name="auth-callback" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="profile-setup" />
              <Stack.Screen
                name="legal/[doc]"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
            </Stack>
          </AuthGate>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
