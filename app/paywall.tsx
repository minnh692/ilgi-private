import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import {
  PURCHASES_MOCK,
  getOfferingPrices,
  purchaseSubscription,
  restorePurchasesRC,
  type OfferingPrices,
} from '@/lib/purchases';
import { FREE_LAUNCH, showSubscriptionComingSoon } from '@/lib/plan';
import type { Database } from '@/types/database';
import FeaturePattern from '../assets/brand/svg/muni-feature-pattern.svg';
import FeatureReport from '../assets/brand/svg/muni-feature-report.svg';
import FeatureLetter from '../assets/brand/svg/muni-feature-letter.svg';
import FeaturePeople from '../assets/brand/svg/muni-feature-people.svg';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

// RevenueCat usually delivers the webhook within seconds
const WEBHOOK_SYNC_DELAY_MS = 5_000;

// Free launch: subscriptions aren't on sale — any route here just says so and goes back
export default function PaywallRoute() {
  useEffect(() => {
    if (FREE_LAUNCH) showSubscriptionComingSoon(() => { if (router.canGoBack()) router.back(); });
  }, []);
  return FREE_LAUNCH ? null : <PaywallScreen />;
}

function PaywallScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [prices, setPrices] = useState<OfferingPrices | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    getOfferingPrices().then(setPrices);
  }, []);

  const isPlus = profile?.plan === 'plus';
  const isAnonymous = user?.is_anonymous ?? true;

  async function refreshProfile() {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (data) setProfile(data as ProfileRow);
  }

  // The server owns the plan (revenuecat-webhook writes it; clients can't). After a purchase or
  // restore, show Plus right away and re-read the profile once the webhook has had time to land.
  function showPlusUntilSynced() {
    if (profile) setProfile({ ...profile, plan: 'plus' } as ProfileRow);
    setTimeout(() => { refreshProfile().catch(() => {}); }, WEBHOOK_SYNC_DELAY_MS);
  }

  async function handleSubscribe(period: 'monthly' | 'annual') {
    // Subscriptions belong to a real account (AI features need login, and an anonymous id would be
    // lost when the account is linked) — link first
    if (isAnonymous) {
      router.push({ pathname: '/login', params: { mode: 'link' } });
      return;
    }
    setIsLoading(true);
    try {
      if (PURCHASES_MOCK) {
        // Mock: UI only. The server plan stays free (clients can't write it) — to test Plus limits,
        // set profiles.plan = 'plus' in the Supabase table editor.
        await new Promise((r) => setTimeout(r, 800));
        if (profile) setProfile({ ...profile, plan: 'plus' } as ProfileRow);
        Alert.alert(
          '구독 시작! (개발 모드)',
          `${period === 'monthly' ? '월간' : '연간'} 플러스 구독 화면만 바뀌었어요. 서버 플랜은 바뀌지 않아요.`,
          [{ text: '확인', onPress: () => router.back() }],
        );
        return;
      }

      const isActive = await purchaseSubscription(period);
      if (isActive) {
        showPlusUntilSynced();
        router.back();
      }
    } catch (err: unknown) {
      const cancelled = typeof err === 'object' && err !== null && 'userCancelled' in err;
      if (!cancelled) {
        Alert.alert('결제 오류', '다시 시도해 주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRestore() {
    if (PURCHASES_MOCK) {
      Alert.alert('구독 복원', isPlus ? '이미 Plus 구독 중이에요.' : '복원할 구독이 없어요.');
      return;
    }
    setRestoring(true);
    try {
      const restored = await restorePurchasesRC();
      if (restored) {
        showPlusUntilSynced();
        Alert.alert('복원 완료', '구독이 복원됐어요.', [{ text: '확인', onPress: () => router.back() }]);
      } else {
        Alert.alert('복원할 구독 없음', '활성 구독을 찾지 못했어요.');
      }
    } catch {
      Alert.alert('복원 오류', '다시 시도해 주세요.');
    } finally {
      setRestoring(false);
    }
  }

  const annualPrice = prices?.annual?.priceString ?? '₩59,000';
  const annualMonthly = prices?.annual?.monthlyEquivalent;
  const monthlyPrice = prices?.monthly?.priceString ?? '₩7,900';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.closeRow}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        >
          <Text style={[styles.closeBtn, { color: colors.subtext }]}>✕</Text>
        </Pressable>
      </View>

      <View style={[styles.content, { paddingHorizontal: spacing.xl }]}>
        {isPlus ? (
          <View style={styles.alreadyPlus}>
            <Text style={[styles.headline, { color: colors.text, fontFamily: typography.fontFamily.bold }]}>
              이미 Plus를 구독 중이에요
            </Text>
            <Pressable
              onPress={() => router.back()}
              style={[styles.primaryBtn, { backgroundColor: colors.accent, borderRadius: radius.lg }]}
            >
              <Text style={[styles.primaryBtnTitle, { fontFamily: typography.fontFamily.bold }]}>
                확인
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={[styles.headline, { color: colors.text, fontFamily: typography.fontFamily.bold }]}>
              AI가 나를 더 깊이{'\n'}알아가기 시작해요
            </Text>

            <View style={styles.features}>
              {[
                { Icon: FeaturePattern, text: '전체 일기 기억으로 패턴 발견' },
                { Icon: FeatureReport, text: '주간·월간 감정 리포트' },
                { Icon: FeatureLetter, text: 'AI 답장 매일 10회' },
                { Icon: FeaturePeople, text: '중요한 사람들 추적' },
              ].map(({ Icon, text }) => (
                <View key={text} style={styles.featureRow}>
                  <Icon width={32} height={32} />
                  <Text style={[styles.featureText, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
                    {text}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={[styles.trialLabel, { color: colors.accent, fontFamily: typography.fontFamily.semiBold }]}>
              7일 무료 체험
            </Text>
            {isAnonymous && (
              <Text style={[styles.loginHint, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
                구독하려면 먼저 계정을 연결해 주세요. 지금까지 쓴 일기는 그대로 옮겨져요.
              </Text>
            )}

            {/* Annual (primary) */}
            <Pressable
              onPress={() => handleSubscribe('annual')}
              disabled={isLoading || restoring}
              style={[styles.primaryBtn, { backgroundColor: colors.accent, borderRadius: radius.lg }]}
              accessibilityRole="button"
              accessibilityLabel="연간 구독 시작"
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={[styles.primaryBtnTitle, { fontFamily: typography.fontFamily.bold }]}>
                    연간 구독
                  </Text>
                  <Text style={[styles.primaryBtnPrice, { fontFamily: typography.fontFamily.regular }]}>
                    {annualPrice}/년{annualMonthly ? ` · 월 ${annualMonthly}` : ''}
                  </Text>
                </>
              )}
            </Pressable>

            {/* Monthly (secondary) */}
            <Pressable
              onPress={() => handleSubscribe('monthly')}
              disabled={isLoading || restoring}
              style={[styles.secondaryBtn, { borderColor: colors.border, borderRadius: radius.lg }]}
              accessibilityRole="button"
              accessibilityLabel="월간 구독 시작"
            >
              <Text style={[styles.secondaryBtnText, { color: colors.text, fontFamily: typography.fontFamily.medium }]}>
                월간 구독 · {monthlyPrice}/월
              </Text>
            </Pressable>

            <Text style={[styles.disclaimer, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
              7일 무료 체험 후 자동 결제돼요. 언제든 취소할 수 있어요.{'\n'}
              실제 가격은 App Store에서 확인해 주세요.
              {PURCHASES_MOCK ? '\n(개발 모드 — 실제 결제 없음)' : ''}
            </Text>

            <Pressable onPress={handleRestore} disabled={restoring} style={styles.restoreBtn}>
              {restoring
                ? <ActivityIndicator size="small" color={colors.subtext} />
                : (
                  <Text style={[styles.restoreText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
                    구독 복원
                  </Text>
                )}
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeRow: { alignItems: 'flex-end', paddingRight: 20, paddingTop: 8 },
  closeBtn: { fontSize: 20, padding: 8 },
  content: { flex: 1, paddingTop: 16 },
  alreadyPlus: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 },
  headline: { fontSize: 28, lineHeight: 38, marginBottom: 28 },
  features: { marginBottom: 28, gap: 14 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureText: { fontSize: 16, flex: 1 },
  trialLabel: { fontSize: 17, textAlign: 'center', marginBottom: 16 },
  loginHint: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 12 },
  primaryBtn: { padding: 18, alignItems: 'center', marginBottom: 12 },
  primaryBtnTitle: { color: '#fff', fontSize: 18, marginBottom: 2 },
  primaryBtnPrice: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  secondaryBtn: { padding: 16, alignItems: 'center', borderWidth: 1, marginBottom: 20 },
  secondaryBtnText: { fontSize: 16 },
  disclaimer: { fontSize: 11, lineHeight: 17, textAlign: 'center' },
  restoreBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  restoreText: { fontSize: 13 },
});
