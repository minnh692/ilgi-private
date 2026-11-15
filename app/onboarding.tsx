import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { onboardingState, marketingConsentNotice } from '@/lib/consent';
import { syncAutoReminder } from '@/lib/notifications';
import { enterApp } from '@/lib/firstEntry';
import LogoHorizontal from '../assets/brand/svg/muni-logo-horizontal.svg';
import LogoHorizontalLight from '../assets/brand/svg/muni-logo-horizontal-light.svg';

export default function OnboardingScreen() {
  const { colors, typography, spacing, radius, dark } = useTheme();
  const Logo = dark ? LogoHorizontalLight : LogoHorizontal;
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [consentTerms, setConsentTerms] = useState(false);
  const [consentSensitive, setConsentSensitive] = useState(false);
  const [consentAi, setConsentAi] = useState(false);
  // Optional: marketing notifications (+ separate night-time consent)
  const [consentMarketing, setConsentMarketing] = useState(!!profile?.consent_marketing_at);
  const [consentNight, setConsentNight] = useState(!!profile?.consent_marketing_night_at);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allConsented = consentTerms && consentSensitive && consentAi;
  // Signed-in (social) accounts can't skip consent; only anonymous users may start private-only
  const isLinked = !!user && !user.is_anonymous;

  // The silent sign-in in index.tsx may not have finished (or may have failed),
  // so retry here and surface the failure instead of doing nothing.
  async function ensureUserId(): Promise<string | null> {
    if (user) return user.id;
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      console.error('[onboarding] anonymous sign-in failed', { code: error?.code, status: error?.status });
      Alert.alert('연결 오류', '로그인하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.');
      return null;
    }
    return data.user.id;
  }

  async function handleAgree() {
    setIsSubmitting(true);
    try {
      const userId = await ensureUserId();
      if (!userId) return;
      const now = new Date().toISOString();
      // Existing accounts (e.g. sent here by the consent guard) keep their onboarding state
      const existing = profile?.id === userId ? profile : null;
      const { privacyOnly: _privacyOnly, ...prevState } = onboardingState(existing);
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          plan: 'free',
          // AI modes become available now; keep the user's choice if they had consented before
          ...(existing?.consent_ai_at ? {} : { default_memory_mode: 'remember' }),
          consent_ai_at: now,
          consent_sensitive_at: now,
          consent_overseas_at: now,
          consent_marketing_at: consentMarketing ? (existing?.consent_marketing_at ?? now) : null,
          consent_marketing_night_at:
            consentMarketing && consentNight ? (existing?.consent_marketing_night_at ?? now) : null,
          // New opt-ins start on the auto reminder, unless the user already picked a fixed time
          reminder_auto: consentMarketing
            ? (existing?.consent_marketing_at ? existing.reminder_auto : !existing?.reminder_time)
            : false,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          // The marketing choice was made on this screen, so the one-time prompt is skipped
          onboarding_state: { completed: false, ...prevState, termsAgreedAt: now, marketingPromptedAt: now },
        })
        .select()
        .single();

      if (error) throw error;
      setProfile(data);

      if (data.consent_marketing_at && !existing?.consent_marketing_at) {
        // Asks for the OS notification permission, then schedules the daily reminder
        await syncAutoReminder(data, { requestPermission: true }).catch(() => null);
        await new Promise<void>((resolve) => {
          Alert.alert(
            '알림 수신 동의 완료',
            marketingConsentNotice(data.consent_marketing_at!, !!data.consent_marketing_night_at),
            [{ text: '확인', onPress: () => resolve() }],
            { cancelable: false },
          );
        });
      }

      // Nickname/birthday setup only once; then first-time users go straight to writing
      if (existing?.nickname) await enterApp(userId);
      else router.replace('/profile-setup');
    } catch (e) {
      console.error('[onboarding] profile upsert failed', { code: (e as { code?: string })?.code });
      Alert.alert('오류', '다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePrivateOnly() {
    setIsSubmitting(true);
    try {
      const userId = await ensureUserId();
      if (!userId) return;
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          plan: 'free',
          default_memory_mode: 'private',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          onboarding_state: { completed: false, privacyOnly: true },
        })
        .select()
        .single();

      if (error) throw error;
      setProfile(data);
      await enterApp(userId);
    } catch (e) {
      console.error('[onboarding] profile upsert failed', { code: (e as { code?: string })?.code });
      Alert.alert('오류', '다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: spacing.xl, paddingBottom: 48 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <Logo width={LOGO_WIDTH} height={LOGO_WIDTH * LOGO_ASPECT} style={styles.logo} accessibilityLabel="무늬" />
          <Text style={[styles.subtitle, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
            나를 기억하는 AI 일기
          </Text>
          <Text style={[styles.tagline, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
            AI가 읽고, 기억하고,{'\n'}답장을 써요.
          </Text>
          <Text style={[styles.description, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            오늘 있었던 일을 쓰면 AI 고양이 무늬가 따뜻한 답장을 드려요.
            일기를 쓸수록 무늬가 나를 더 잘 알아가고, 감정과 습관의 패턴을 발견해 드려요.
          </Text>
          <Text style={[styles.disclosure, { color: colors.subtext, fontFamily: typography.fontFamily.regular, borderColor: colors.border }]}>
            답장은 AI가 써요. 의료 서비스가 아니에요.
          </Text>
        </View>

        <View style={styles.consentsSection}>
          <Text style={[styles.consentHeader, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
            이용 동의
          </Text>

          <ConsentRow
            value={consentTerms}
            onChange={setConsentTerms}
            label="이용약관 및 개인정보 처리방침에 동의해요"
            onViewDetail={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
            colors={colors}
            typography={typography}
            spacing={spacing}
          />

          <ConsentRow
            value={consentSensitive}
            onChange={setConsentSensitive}
            label="민감정보(감정·심리 관련 내용) 처리에 동의해요"
            onViewDetail={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'sensitive' } })}
            colors={colors}
            typography={typography}
            spacing={spacing}
          />

          <ConsentRow
            value={consentAi}
            onChange={setConsentAi}
            label="일기 내용을 AI 답장 생성을 위해 Anthropic(미국)에 전송하는 것에 동의해요"
            onViewDetail={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'overseas' } })}
            colors={colors}
            typography={typography}
            spacing={spacing}
          />

          <ConsentRow
            optional
            value={consentMarketing}
            onChange={(v) => {
              setConsentMarketing(v);
              if (!v) setConsentNight(false);
            }}
            label="일기 알림과 무늬 소식(광고성 정보)을 받고, 알림 시간을 내가 일기 쓰는 시간에 맞추는 데 동의해요"
            onViewDetail={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'marketing' } })}
            colors={colors}
            typography={typography}
            spacing={spacing}
          />

          <ConsentRow
            optional
            value={consentNight}
            onChange={(v) => {
              setConsentNight(v);
              if (v) setConsentMarketing(true);
            }}
            label="밤(오후 9시~오전 8시)에도 알림을 받을게요"
            colors={colors}
            typography={typography}
            spacing={spacing}
          />

          <Text style={[styles.consentHint, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            동의하면 매일 {consentNight ? '오후 10시' : '오후 8시 30분'}에 알림을 보내고, 일기가 쌓이면 자주 쓰는 시간에 맞춰 드려요. 설정에서 언제든 끌 수 있어요.
          </Text>
        </View>

        <Pressable
          onPress={handleAgree}
          disabled={!allConsented || isSubmitting}
          style={[
            styles.primaryButton,
            {
              backgroundColor: allConsented ? colors.accent : colors.border,
              borderRadius: radius.lg,
              marginTop: spacing.xl,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="동의하고 시작하기"
        >
          <Text style={[styles.primaryButtonText, { fontFamily: typography.fontFamily.semiBold }]}>
            동의하고 시작하기
          </Text>
        </Pressable>

        {isLinked ? (
          <>
            <Text style={[styles.legalNotice, { color: colors.subtext, fontFamily: typography.fontFamily.regular, marginTop: spacing.lg }]}>
              로그인한 계정은 필수 항목에 동의해야 이용할 수 있어요.
            </Text>
            <Pressable
              onPress={() => supabase.auth.signOut()}
              disabled={isSubmitting}
              style={{ marginTop: spacing.sm, alignItems: 'center', padding: spacing.sm }}
              accessibilityRole="button"
              accessibilityLabel="로그아웃"
            >
              <Text style={[styles.secondaryButtonText, { color: colors.subtext, fontFamily: typography.fontFamily.regular, textDecorationLine: 'underline' }]}>
                로그아웃
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={handlePrivateOnly}
              disabled={isSubmitting}
              style={{ marginTop: spacing.base, alignItems: 'center', padding: spacing.sm }}
              accessibilityRole="button"
              accessibilityLabel="동의하지 않고 시작"
            >
              <Text style={[styles.secondaryButtonText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
                동의하지 않고 시작 (AI 답장 없음)
              </Text>
            </Pressable>

            <Text style={[styles.legalNotice, { color: colors.subtext, fontFamily: typography.fontFamily.regular, marginTop: spacing.lg }]}>
              시작하면{' '}
              <Text
                style={[styles.legalLink, { color: colors.text }]}
                onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
                accessibilityRole="link"
              >
                이용약관
              </Text>
              과{' '}
              <Text
                style={[styles.legalLink, { color: colors.text }]}
                onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}
                accessibilityRole="link"
              >
                개인정보 처리방침
              </Text>
              에 동의하는 것으로 봐요.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ConsentRow({
  value,
  onChange,
  label,
  onViewDetail,
  optional,
  colors,
  typography,
  spacing,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  onViewDetail?: () => void;
  optional?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  typography: ReturnType<typeof useTheme>['typography'];
  spacing: ReturnType<typeof useTheme>['spacing'];
}) {
  return (
    <View style={[styles.consentRow, { paddingVertical: spacing.sm }]}>
      <Pressable
        onPress={() => onChange(!value)}
        style={styles.consentToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: value }}
        accessibilityLabel={label}
      >
        <View style={[styles.checkbox, { borderColor: value ? colors.accent : colors.border, backgroundColor: value ? colors.accent : 'transparent' }]}>
          {value && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={[styles.consentLabel, { color: colors.text, fontFamily: typography.fontFamily.regular, flex: 1 }]}>
          <Text style={{ color: optional ? colors.subtext : colors.accent }}>{optional ? '[선택] ' : '[필수] '}</Text>
          {label}
        </Text>
      </Pressable>
      {onViewDetail && (
        <Pressable onPress={onViewDetail} hitSlop={8} accessibilityRole="link" accessibilityLabel="자세히 보기">
          <Text style={[styles.viewDetail, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            보기
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// muni-logo-horizontal.svg viewBox is 860×300
const LOGO_WIDTH = 200;
const LOGO_ASPECT = 300 / 860;

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 48 },
  heroSection: { marginBottom: 40 },
  logo: { marginLeft: -8, marginBottom: 8 },
  subtitle: { fontSize: 15, marginBottom: 20 },
  tagline: { fontSize: 26, lineHeight: 36, marginBottom: 16 },
  description: { fontSize: 16, lineHeight: 26, marginBottom: 16 },
  disclosure: {
    fontSize: 13,
    lineHeight: 20,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  consentsSection: { marginBottom: 8 },
  consentHeader: { fontSize: 17, marginBottom: 12 },
  consentHint: { fontSize: 13, lineHeight: 20, marginTop: 4, marginLeft: 34 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  consentToggle: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  viewDetail: { fontSize: 14, textDecorationLine: 'underline', marginTop: 1 },
  legalNotice: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  legalLink: { textDecorationLine: 'underline' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  consentLabel: { fontSize: 15, lineHeight: 22 },
  primaryButton: { padding: 16, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 17 },
  secondaryButtonText: { fontSize: 14 },
});
