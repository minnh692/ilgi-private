import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTheme } from '@/theme/useTheme';
import Constants from 'expo-constants';

const MOCK_PURCHASES = Constants.expoConfig?.extra?.mockPurchases as boolean;

export default function PaywallScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubscribe(period: 'monthly' | 'annual') {
    setIsLoading(true);
    try {
      if (MOCK_PURCHASES) {
        // Mock: simulate purchase flow
        await new Promise((r) => setTimeout(r, 1000));
        Alert.alert(
          '구독 시작! (개발 모드)',
          `${period === 'monthly' ? '월' : '연'}간 구독이 시작되었습니다. (모의 결제)`,
          [{ text: '확인', onPress: () => router.back() }]
        );
        return;
      }

      // Real purchase via RevenueCat
      // Lazy import to allow Expo Go testing
      const Purchases = (await import('react-native-purchases')).default;
      const offerings = await Purchases.getOfferings();
      const offering = offerings.current;
      if (!offering) throw new Error('No offering available');

      const pkg = period === 'monthly'
        ? offering.monthly
        : offering.annual;

      if (!pkg) throw new Error('Package not found');

      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const isActive = customerInfo.entitlements.active['plus'];
      if (isActive) {
        router.back();
      }
    } catch (err: unknown) {
      const isPurchaseCancelledError = (e: unknown): boolean => {
        return typeof e === 'object' && e !== null && 'userCancelled' in e;
      };
      if (!isPurchaseCancelledError(err)) {
        Alert.alert('오류', '결제 중 문제가 생겼어요. 다시 시도해 주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  }

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
        <Text style={[styles.headline, { color: colors.text, fontFamily: typography.fontFamily.bold }]}>
          AI가 나를 더 깊이{'\n'}알아가기 시작해요
        </Text>

        <View style={styles.features}>
          {[
            { icon: '🧠', text: '전체 일기 기억으로 패턴 발견' },
            { icon: '📊', text: '주간·월간 감정 리포트' },
            { icon: '♾️', text: 'AI 답장 무제한 (하루 10회)' },
            { icon: '👥', text: '중요한 사람들 추적' },
          ].map(({ icon, text }) => (
            <View key={text} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{icon}</Text>
              <Text style={[styles.featureText, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
                {text}
              </Text>
            </View>
          ))}
        </View>

        <Text style={[styles.trialLabel, { color: colors.accent, fontFamily: typography.fontFamily.semiBold }]}>
          7일 무료 체험
        </Text>

        <Pressable
          onPress={() => handleSubscribe('annual')}
          disabled={isLoading}
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
                ₩59,000/년 · 월 ₩4,917
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() => handleSubscribe('monthly')}
          disabled={isLoading}
          style={[styles.secondaryBtn, { borderColor: colors.border, borderRadius: radius.lg }]}
          accessibilityRole="button"
          accessibilityLabel="월간 구독 시작"
        >
          <Text style={[styles.secondaryBtnText, { color: colors.text, fontFamily: typography.fontFamily.medium }]}>
            월간 구독 · ₩7,900/월
          </Text>
        </Pressable>

        <Text style={[styles.disclaimer, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
          7일 무료 체험 후 자동 결제돼요. 언제든 취소 가능해요.{'\n'}
          가격은 App Store에서 확인할 수 있어요.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeRow: { alignItems: 'flex-end', paddingRight: 20, paddingTop: 8 },
  closeBtn: { fontSize: 20, padding: 8 },
  content: { flex: 1, paddingTop: 16 },
  headline: { fontSize: 28, lineHeight: 38, marginBottom: 28 },
  features: { marginBottom: 28, gap: 14 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { fontSize: 22, width: 32 },
  featureText: { fontSize: 16, flex: 1 },
  trialLabel: { fontSize: 17, textAlign: 'center', marginBottom: 16 },
  primaryBtn: { padding: 18, alignItems: 'center', marginBottom: 12 },
  primaryBtnTitle: { color: '#fff', fontSize: 18, marginBottom: 2 },
  primaryBtnPrice: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  secondaryBtn: { padding: 16, alignItems: 'center', borderWidth: 1, marginBottom: 20 },
  secondaryBtnText: { fontSize: 16 },
  disclaimer: { fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
