import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { onboardingState, marketingConsentNotice } from '@/lib/consent';
import { syncAutoReminder } from '@/lib/notifications';

/**
 * One-time ask for the optional marketing consent, for accounts that finished onboarding before
 * the consent existed. Either answer is recorded in `onboarding_state.marketingPromptedAt`, so it
 * never shows again (on any device). New users answer on the onboarding screen instead.
 *
 * Rendered as an overlay rather than a <Modal> so the legal document screen can open above it.
 */
export function MarketingConsentPrompt() {
  const { colors, typography, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [night, setNight] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const state = onboardingState(profile);
  const shouldAsk =
    !!user &&
    !!profile &&
    profile.id === user.id &&
    !!profile.consent_ai_at && // finished the required consents
    !profile.consent_marketing_at &&
    !state.marketingPromptedAt;

  if (!shouldAsk || dismissed) return null;

  async function answer(agree: boolean) {
    if (!user || !profile) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('profiles')
        .update({
          onboarding_state: { ...state, marketingPromptedAt: now },
          ...(agree
            ? {
                consent_marketing_at: now,
                consent_marketing_night_at: night ? now : null,
                // Keep a reminder time the user already picked themselves
                reminder_auto: !profile.reminder_time,
              }
            : {}),
        })
        .eq('id', user.id)
        .select()
        .single();
      if (error) throw error;

      setDismissed(true);
      setProfile(data);
      if (agree) {
        // Asks for the OS notification permission, then schedules the daily reminder
        await syncAutoReminder(data, { requestPermission: true }).catch(() => null);
        Alert.alert('알림 수신 동의 완료', marketingConsentNotice(now, night));
      }
    } catch (e) {
      console.error('[marketing-prompt] save failed', { code: (e as { code?: string })?.code });
      Alert.alert('오류', '저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingHorizontal: spacing.xl,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
          일기 쓸 시간에 알려 드릴까요?
        </Text>
        <Text style={[styles.body, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
          동의하면 매일 {night ? '오후 10시' : '오후 8시 30분'}에 알림을 보내고, 일기가 쌓이면 자주 쓰는 시간에 맞춰 드려요. 무늬의 새 소식도 함께 전해 드려요.
        </Text>

        <View style={[styles.detailBox, { borderColor: colors.border, borderRadius: radius.md }]}>
          <Text style={[styles.detail, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
            <Text style={{ color: colors.subtext }}>[선택] </Text>
            광고성 정보(앱 알림) 수신과, 알림 시간 맞춤을 위한 일기 작성 시각 분석에 동의해요.{' '}
            <Text
              style={{ textDecorationLine: 'underline', color: colors.subtext }}
              onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'marketing' } })}
              accessibilityRole="link"
            >
              자세히 보기
            </Text>
          </Text>

          <Pressable
            onPress={() => setNight((v) => !v)}
            style={styles.nightRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: night }}
            accessibilityLabel="밤에도 알림 받기, 오후 9시부터 오전 8시"
          >
            <View style={[styles.checkbox, { borderColor: night ? colors.accent : colors.border, backgroundColor: night ? colors.accent : 'transparent' }]}>
              {night && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={[styles.detail, { color: colors.text, fontFamily: typography.fontFamily.regular, flex: 1 }]}>
              <Text style={{ color: colors.subtext }}>[선택] </Text>
              밤(오후 9시~오전 8시)에도 알림을 받을게요
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => answer(true)}
          disabled={busy}
          style={[styles.primaryButton, { backgroundColor: colors.accent, borderRadius: radius.lg }]}
          accessibilityRole="button"
          accessibilityLabel="동의하고 알림 받기"
        >
          <Text style={[styles.primaryButtonText, { fontFamily: typography.fontFamily.semiBold }]}>
            동의하고 알림 받기
          </Text>
        </Pressable>
        <Pressable
          onPress={() => answer(false)}
          disabled={busy}
          style={styles.secondaryButton}
          accessibilityRole="button"
          accessibilityLabel="괜찮아요"
        >
          <Text style={[styles.secondaryButtonText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            괜찮아요
          </Text>
        </Pressable>
        <Text style={[styles.footnote, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
          설정 &gt; 알림에서 언제든 바꿀 수 있어요.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: { paddingTop: 24 },
  title: { fontSize: 20, marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 23 },
  detailBox: { borderWidth: 1, padding: 14, marginTop: 16, gap: 12 },
  detail: { fontSize: 14, lineHeight: 21 },
  nightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  primaryButton: { padding: 16, alignItems: 'center', marginTop: 20 },
  primaryButtonText: { color: '#fff', fontSize: 17 },
  secondaryButton: { alignItems: 'center', padding: 12, marginTop: 4 },
  secondaryButtonText: { fontSize: 15 },
  footnote: { fontSize: 12, textAlign: 'center', marginTop: 2 },
});
