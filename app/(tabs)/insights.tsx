import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { useAuthStore } from '@/stores/authStore';

function LockedCard() {
  const { colors, typography, spacing, radius, shadow } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing.base,
          marginBottom: spacing.sm,
          ...shadow.sm,
        },
      ]}
    >
      <Text style={[styles.lockedTitle, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
        🔒 패턴 카드
      </Text>
      <Text style={[styles.lockedHint, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
        Plus로 업그레이드하면 AI가 발견한 패턴을 확인할 수 있어요.
      </Text>
    </View>
  );
}

export default function InsightsTab() {
  const { colors, typography, spacing } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const isPlus = profile?.plan === 'plus';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
          <Text style={[styles.headerTitle, { color: colors.text, fontFamily: typography.fontFamily.bold }]}>
            인사이트
          </Text>
          {!isPlus && (
            <Link href="/paywall" asChild>
              <Pressable
                style={[styles.plusChip, { backgroundColor: colors.accent }]}
                accessibilityRole="button"
                accessibilityLabel="Plus로 업그레이드"
              >
                <Text style={[styles.plusText, { fontFamily: typography.fontFamily.medium }]}>
                  Plus
                </Text>
              </Pressable>
            </Link>
          )}
        </View>

        <View style={{ paddingHorizontal: spacing.base, marginTop: spacing.sm }}>
          {/* Weekly report placeholder */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderRadius: 16,
                padding: spacing.base,
                marginBottom: spacing.sm,
              },
            ]}
          >
            <Text style={[styles.cardLabel, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
              이번 주
            </Text>
            <Text style={[styles.cardBody, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
              일기를 더 쓰면 주간 리포트가 만들어져요.
            </Text>
          </View>

          {/* Mood trend placeholder */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderRadius: 16,
                padding: spacing.base,
                marginBottom: spacing.sm,
              },
            ]}
          >
            <Text style={[styles.cardLabel, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
              30일 감정 흐름
            </Text>
            <Text style={[styles.cardBody, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
              기분을 기록하면 여기서 흐름을 볼 수 있어요.
            </Text>
          </View>

          {/* Pattern cards */}
          {isPlus ? (
            <Text style={[{ color: colors.subtext, fontFamily: typography.fontFamily.regular, textAlign: 'center', marginTop: 32 }]}>
              패턴이 발견되면 여기에 표시돼요.
            </Text>
          ) : (
            <LockedCard />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 28 },
  plusChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  plusText: { color: '#fff', fontSize: 13 },
  card: {},
  cardLabel: { fontSize: 12, marginBottom: 6 },
  cardBody: { fontSize: 15, lineHeight: 22 },
  lockedTitle: { fontSize: 15, marginBottom: 6 },
  lockedHint: { fontSize: 14, lineHeight: 20 },
});
