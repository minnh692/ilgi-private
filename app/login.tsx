import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase';
import { useSocialSignIn } from '@/hooks/useSocialSignIn';
import { isAppleSignInSupported, PROVIDER_LABEL, type SocialProvider } from '@/lib/socialAuth';
import LogoHorizontal from '../assets/brand/svg/muni-logo-horizontal.svg';
import LogoHorizontalLight from '../assets/brand/svg/muni-logo-horizontal-light.svg';
import KakaoSymbol from '../assets/login/kakao-symbol.svg';

// Official marks: Google G (96px PNG), Kakao symbol (from Kakao's login resources)
const GOOGLE_G = require('../assets/login/google-g.png');

// Brand colors required by each provider's button guidelines
const KAKAO_YELLOW = '#FEE500';
const KAKAO_LABEL = 'rgba(0, 0, 0, 0.85)';

const BUTTON_HEIGHT = 52;

// muni-logo-horizontal.svg viewBox is 860×300
const LOGO_WIDTH = 200;
const LOGO_ASPECT = 300 / 860;

/**
 * Entry point for signed-out users (`/login`), and the account-linking sheet for
 * anonymous users (`/login?mode=link`) — linking keeps their diary via claim-anonymous-data.
 */
export default function LoginScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isLink = mode === 'link';
  const { colors, typography, spacing, radius, dark } = useTheme();
  const Logo = dark ? LogoHorizontalLight : LogoHorizontal;
  const { pending, signIn } = useSocialSignIn();
  const [startingAnonymous, setStartingAnonymous] = useState(false);
  const busy = pending !== null || startingAnonymous;

  async function handleProvider(provider: SocialProvider) {
    const ok = await signIn(provider);
    if (!ok) return;
    if (isLink) {
      Alert.alert('계정 연결 완료', `${PROVIDER_LABEL[provider]} 계정에 일기가 안전하게 보관돼요.`);
      router.back();
    } else {
      // index.tsx routes to onboarding or the diary depending on the profile
      router.replace('/');
    }
  }

  async function handleAnonymous() {
    setStartingAnonymous(true);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      router.replace('/');
    } catch (e) {
      console.error('[login] anonymous sign-in failed', { code: (e as { code?: string })?.code });
      Alert.alert('연결 오류', '시작하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.');
    } finally {
      setStartingAnonymous(false);
    }
  }

  const buttonBase = { height: BUTTON_HEIGHT, borderRadius: radius.md };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {isLink && (
        <View style={[styles.topBar, { paddingHorizontal: spacing.base }]}>
          <Pressable onPress={() => router.back()} hitSlop={8} disabled={busy} accessibilityRole="button" accessibilityLabel="닫기">
            <Text style={{ color: colors.subtext, fontFamily: typography.fontFamily.regular, fontSize: 16 }}>닫기</Text>
          </Pressable>
        </View>
      )}

      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: spacing.xl }]}>
        <View style={styles.hero}>
          <Logo width={LOGO_WIDTH} height={LOGO_WIDTH * LOGO_ASPECT} style={styles.logo} accessibilityLabel="무늬" />
          <Text style={[styles.title, { color: colors.text, fontFamily: typography.fontFamily.bold }]}>
            {isLink ? '계정을 연결해요' : '무늬와 함께\n일기를 시작해요'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            {isLink
              ? '지금까지 쓴 일기와 무늬의 기억이 그대로 옮겨져요. 기기를 바꿔도 이어서 쓸 수 있어요.'
              : '로그인하면 기기를 바꿔도 일기와 무늬의 기억이 그대로 유지돼요.'}
          </Text>
        </View>

        <View style={{ gap: spacing.md }}>
          {isAppleSignInSupported && (
            <View style={{ opacity: busy ? 0.5 : 1 }} pointerEvents={busy ? 'none' : 'auto'}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={dark
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={radius.md}
                style={{ height: BUTTON_HEIGHT, width: '100%' }}
                onPress={() => handleProvider('apple')}
              />
            </View>
          )}

          <Pressable
            onPress={() => handleProvider('google')}
            disabled={busy}
            style={[styles.button, buttonBase, {
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: colors.border,
              opacity: busy && pending !== 'google' ? 0.5 : 1,
            }]}
            accessibilityRole="button"
            accessibilityLabel="Google로 계속하기"
          >
            {pending === 'google' ? (
              <ActivityIndicator color="#1F1F1F" />
            ) : (
              <>
                <Image source={GOOGLE_G} style={styles.providerIcon} accessibilityElementsHidden importantForAccessibility="no" />
                <Text style={[styles.buttonText, { color: '#1F1F1F', fontFamily: typography.fontFamily.semiBold }]}>
                  Google로 계속하기
                </Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={() => handleProvider('kakao')}
            disabled={busy}
            style={[styles.button, buttonBase, {
              backgroundColor: KAKAO_YELLOW,
              opacity: busy && pending !== 'kakao' ? 0.5 : 1,
            }]}
            accessibilityRole="button"
            accessibilityLabel="카카오로 계속하기"
          >
            {pending === 'kakao' ? (
              <ActivityIndicator color={KAKAO_LABEL} />
            ) : (
              <>
                <KakaoSymbol width={18} height={18} style={styles.providerIcon} accessibilityElementsHidden importantForAccessibility="no" />
                <Text style={[styles.buttonText, { color: KAKAO_LABEL, fontFamily: typography.fontFamily.semiBold }]}>
                  카카오로 계속하기
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {!isLink && (
          <Pressable
            onPress={handleAnonymous}
            disabled={busy}
            style={{ marginTop: spacing.xl, alignItems: 'center', padding: spacing.sm }}
            accessibilityRole="button"
            accessibilityLabel="로그인 없이 시작하기"
          >
            {startingAnonymous ? (
              <ActivityIndicator color={colors.subtext} />
            ) : (
              <Text style={[styles.secondaryText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
                로그인 없이 시작하기
              </Text>
            )}
          </Pressable>
        )}

        {!isLink && (
          <Text style={[styles.footnote, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            로그인 없이 시작하면 일기만 쓸 수 있고, 무늬의 답장은 로그인 후 받을 수 있어요. 계정은 나중에 설정에서 연결해도 돼요.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 32 },
  hero: { marginBottom: 40 },
  logo: { marginLeft: -8, marginBottom: 16 },
  title: { fontSize: 26, lineHeight: 36, marginBottom: 12 },
  subtitle: { fontSize: 15, lineHeight: 23 },
  button: { alignItems: 'center', justifyContent: 'center' },
  // Logo pinned left, label centered — matches the Apple button's layout
  providerIcon: { position: 'absolute', left: 18, width: 20, height: 20 },
  buttonText: { fontSize: 17 },
  secondaryText: { fontSize: 15, textDecorationLine: 'underline' },
  footnote: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
});
