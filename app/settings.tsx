import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { CRISIS_RESOURCES } from '../config/crisisResources';

function SettingRow({
  label,
  value,
  onPress,
  destructive,
  colors,
  typography,
  spacing,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  destructive?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  typography: ReturnType<typeof useTheme>['typography'];
  spacing: ReturnType<typeof useTheme>['spacing'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, { paddingVertical: spacing.base, borderBottomColor: colors.border }]}
      accessibilityRole="button"
    >
      <Text style={[
        styles.rowLabel,
        {
          color: destructive ? colors.error : colors.text,
          fontFamily: typography.fontFamily.regular,
        },
      ]}>
        {label}
      </Text>
      {value && (
        <Text style={[styles.rowValue, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
          {value}
        </Text>
      )}
    </Pressable>
  );
}

function SectionHeader({ title, colors, typography }: {
  title: string;
  colors: ReturnType<typeof useTheme>['colors'];
  typography: ReturnType<typeof useTheme>['typography'];
}) {
  return (
    <Text style={[styles.sectionHeader, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
      {title}
    </Text>
  );
}

export default function SettingsScreen() {
  const { colors, typography, spacing } = useTheme();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const reset = useAuthStore((s) => s.reset);

  const isAnonymous = user?.is_anonymous;
  const isPlus = profile?.plan === 'plus';

  async function handleSignOut() {
    Alert.alert('로그아웃', '로그아웃할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        onPress: async () => {
          await supabase.auth.signOut();
          reset();
          router.replace('/');
        },
      },
    ]);
  }

  async function handleDeleteAccount() {
    Alert.alert(
      '계정 삭제',
      '모든 일기와 AI 기억이 영구적으로 삭제돼요. 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
                {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${session?.access_token}` },
                }
              );
              reset();
              router.replace('/');
            } catch {
              Alert.alert('오류', '다시 시도해 주세요.');
            }
          },
        },
      ]
    );
  }

  async function handleDeleteMemory() {
    Alert.alert('모든 기억 삭제', 'AI가 기억한 모든 내용이 삭제돼요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          if (!user) return;
          await supabase.from('memory_items').delete().eq('user_id', user.id);
          Alert.alert('삭제 완료', 'AI 기억이 모두 삭제됐어요.');
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { paddingHorizontal: spacing.base, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="뒤로">
          <Text style={[styles.backBtn, { color: colors.accent, fontFamily: typography.fontFamily.medium }]}>
            ← 뒤로
          </Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
          설정
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.base, paddingBottom: 48 }}>
        {/* Account */}
        <SectionHeader title="계정" colors={colors} typography={typography} />

        {isAnonymous ? (
          <SettingRow
            label="Apple로 계정 연결"
            value="→"
            onPress={() => Alert.alert('준비 중', 'Apple 계정 연결 기능이 곧 추가돼요.')}
            colors={colors}
            typography={typography}
            spacing={spacing}
          />
        ) : (
          <SettingRow
            label="Apple 계정 연결됨"
            value={user?.email ?? ''}
            onPress={() => {}}
            colors={colors}
            typography={typography}
            spacing={spacing}
          />
        )}

        <SettingRow
          label="로그아웃"
          onPress={handleSignOut}
          colors={colors}
          typography={typography}
          spacing={spacing}
        />

        {/* Plan */}
        <SectionHeader title="구독" colors={colors} typography={typography} />
        <SettingRow
          label={isPlus ? 'Plus 구독 중' : '무료 플랜'}
          value={isPlus ? undefined : 'Plus로 업그레이드 →'}
          onPress={() => !isPlus && router.push('/paywall')}
          colors={colors}
          typography={typography}
          spacing={spacing}
        />
        <SettingRow
          label="구독 복원"
          onPress={async () => {
            try {
              const Purchases = (await import('react-native-purchases')).default;
              await Purchases.restorePurchases();
              Alert.alert('완료', '구독이 복원됐어요.');
            } catch {
              Alert.alert('오류', '복원 중 오류가 발생했어요.');
            }
          }}
          colors={colors}
          typography={typography}
          spacing={spacing}
        />

        {/* Privacy */}
        <SectionHeader title="개인정보 · 기억" colors={colors} typography={typography} />
        <SettingRow
          label="모든 AI 기억 삭제"
          onPress={handleDeleteMemory}
          colors={colors}
          typography={typography}
          spacing={spacing}
        />
        <SettingRow
          label="개인정보 처리방침"
          onPress={() => Alert.alert('준비 중', '앱 출시 전 연결될 예정이에요.')}
          colors={colors}
          typography={typography}
          spacing={spacing}
        />
        <SettingRow
          label="이용약관"
          onPress={() => Alert.alert('준비 중', '앱 출시 전 연결될 예정이에요.')}
          colors={colors}
          typography={typography}
          spacing={spacing}
        />

        {/* Crisis */}
        <SectionHeader title="위기 상담" colors={colors} typography={typography} />
        {(CRISIS_RESOURCES as readonly { name: string; number: string; description: string; callNumber: string }[]).map((r) => (
          <View key={r.number} style={[styles.crisisRow, { paddingVertical: spacing.sm }]}>
            <Text style={[styles.crisisName, { color: colors.text, fontFamily: typography.fontFamily.medium }]}>
              {r.name}
            </Text>
            <Text style={[styles.crisisDesc, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
              {r.number} · {r.description}
            </Text>
          </View>
        ))}

        {/* Disclaimer */}
        <View style={[styles.disclaimer, { borderColor: colors.border }]}>
          <Text style={[styles.disclaimerText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            이 앱은 의료 서비스가 아니에요. 진단, 치료, 또는 의료적 조언을 제공하지 않아요.
            위기 상황에서는 전문가의 도움을 받으세요.
          </Text>
        </View>

        {/* Danger zone */}
        <SectionHeader title="위험 구역" colors={colors} typography={typography} />
        <SettingRow
          label="계정 삭제"
          onPress={handleDeleteAccount}
          destructive
          colors={colors}
          typography={typography}
          spacing={spacing}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17 },
  backBtn: { fontSize: 16, minWidth: 60 },
  sectionHeader: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { fontSize: 16 },
  rowValue: { fontSize: 14 },
  crisisRow: {},
  crisisName: { fontSize: 15, marginBottom: 2 },
  crisisDesc: { fontSize: 13 },
  disclaimer: {
    marginTop: 24,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  disclaimerText: { fontSize: 12, lineHeight: 18 },
});
