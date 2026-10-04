import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Switch, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { PROVIDER_LABEL, linkedProviders, getLastSignInProvider, clearLastSignInProvider, type SocialProvider } from '@/lib/socialAuth';
import { CRISIS_RESOURCES } from '../config/crisisResources';
import { PURCHASES_MOCK, restorePurchasesRC, logoutPurchasesUser } from '@/lib/purchases';
import { FREE_LAUNCH } from '@/lib/plan';
import { isHardwareAvailable, isLockEnabled, setLockEnabled } from '@/lib/appLock';
import { hasScheduledReminder } from '@/lib/notifications';
import { ReminderModal } from '@/components/ReminderModal';
import Constants from 'expo-constants';
import type { Database } from '@/types/database';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

const MEMORY_MODE_OPTIONS: { label: string; value: string; desc: string }[] = [
  { label: '기억', value: 'remember', desc: 'AI가 패턴을 학습해요' },
  { label: '답장만', value: 'reply_only', desc: 'AI가 답장만 써요' },
  { label: '비공개', value: 'private', desc: 'AI 기능 없음' },
];

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl as string;

function SettingRow({
  label,
  value,
  onPress,
  destructive,
  colors,
  typography,
  spacing,
  right,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  destructive?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  typography: ReturnType<typeof useTheme>['typography'];
  spacing: ReturnType<typeof useTheme>['spacing'];
  right?: React.ReactNode;
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
      {right ?? (value && (
        <Text style={[styles.rowValue, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
          {value}
        </Text>
      ))}
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
  const { colors, typography, spacing, radius } = useTheme();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const reset = useAuthStore((s) => s.reset);
  const [restoring, setRestoring] = useState(false);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [reminderTime, setReminderTime] = useState<string | null>(profile?.reminder_time ?? null);
  const [lockEnabled, setLockEnabledState] = useState(false);
  const [lockAvailable, setLockAvailable] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Linked = signed in with a social provider. (No user at all — e.g. mid sign-out — is not "linked".)
  const isLinked = !!user && !user.is_anonymous;
  const isPlus = profile?.plan === 'plus';
  const defaultMode = (profile?.default_memory_mode as string) ?? 'remember';

  const [lastProvider, setLastProvider] = useState<SocialProvider | null>(null);
  useEffect(() => { getLastSignInProvider().then(setLastProvider); }, [user?.id]);
  // "카카오" or "카카오 (Google도 연결됨)": the provider used to sign in on this device first;
  // others share the account because Supabase links identities with the same email
  const linked = linkedProviders(user);
  const current = lastProvider && linked.includes(lastProvider) ? lastProvider : linked[0];
  const others = linked.filter((p) => p !== current).map((p) => PROVIDER_LABEL[p]);
  const accountLabel = current
    ? `${PROVIDER_LABEL[current]}${others.length ? ` (${others.join(' · ')}도 연결됨)` : ''}`
    : '';

  useEffect(() => {
    isHardwareAvailable().then(setLockAvailable);
    isLockEnabled().then(setLockEnabledState);
    hasScheduledReminder().then((has) => {
      if (!has) setReminderTime(null);
    });
  }, []);

  async function handleSignOut() {
    Alert.alert('로그아웃', '로그아웃할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        onPress: async () => {
          await supabase.auth.signOut();
          await Promise.all([logoutPurchasesUser(), clearLastSignInProvider()]);
          reset();
          // AuthGate in app/_layout.tsx sees the missing session and moves to /login
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
                `${SUPABASE_URL}/functions/v1/delete-account`,
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

  async function handleDefaultModeChange(mode: string) {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .update({ default_memory_mode: mode })
      .eq('id', user.id)
      .select()
      .maybeSingle();
    if (data) setProfile(data as ProfileRow);
  }

  async function handleLockToggle(value: boolean) {
    if (value) {
      const { default: authenticate } = await import('@/lib/appLock').then((m) => ({ default: m.authenticate }));
      const ok = await authenticate();
      if (!ok) return;
    }
    await setLockEnabled(value);
    setLockEnabledState(value);
  }

  async function handleExport() {
    if (!user) return;
    setExporting(true);
    try {
      const { data: entries } = await supabase
        .from('entries')
        .select('entry_date, title, content, mood, memory_mode, created_at')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: true });

      if (!entries?.length) {
        Alert.alert('내보내기', '내보낼 일기가 없어요.');
        return;
      }

      const lines = entries.map((e) => {
        const moodStr = e.mood != null ? ` (기분 ${e.mood}/5)` : '';
        const titleStr = e.title ? ` — ${e.title}` : '';
        return `## ${e.entry_date}${titleStr}${moodStr}\n\n${e.content}\n`;
      });
      const text = `# 일기 내보내기\n내보낸 날짜: ${new Date().toLocaleDateString('ko-KR')}\n\n---\n\n${lines.join('\n---\n\n')}`;

      const uri = FileSystem.documentDirectory + 'ilgi_export.md';
      await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'text/markdown', dialogTitle: '일기 내보내기' });
      } else {
        Alert.alert('내보내기 완료', `파일이 저장됐어요: ${uri}`);
      }
    } catch {
      Alert.alert('오류', '내보내기 중 문제가 생겼어요.');
    } finally {
      setExporting(false);
    }
  }

  function reminderLabel() {
    if (!reminderTime) return '꺼짐';
    const [h, m] = reminderTime.split(':').map(Number);
    const period = h < 12 ? '오전' : '오후';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${period} ${displayH}:${String(m).padStart(2, '0')}`;
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

        {!isLinked ? (
          <SettingRow
            label="계정 연결하기"
            value="Apple · Google · 카카오"
            onPress={() => router.push({ pathname: '/login', params: { mode: 'link' } })}
            colors={colors}
            typography={typography}
            spacing={spacing}
          />
        ) : (
          <SettingRow
            label="로그인 계정"
            value={accountLabel || user?.email || '연결됨'}
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

        {/* Profile — nickname / birthday used in 무늬's replies */}
        <SectionHeader title="내 정보" colors={colors} typography={typography} />
        <SettingRow
          label="닉네임 · 생일"
          value={profile?.nickname ?? '설정 안 함'}
          onPress={() => router.push({ pathname: '/profile-setup', params: { mode: 'edit' } })}
          colors={colors}
          typography={typography}
          spacing={spacing}
        />

        {/* Plan — hidden during the free launch (no subscriptions on sale yet) */}
        {!FREE_LAUNCH && (
          <>
            <SectionHeader title="구독" colors={colors} typography={typography} />
            <SettingRow
              label={isPlus ? 'Plus 구독 중' : '무료 플랜'}
              value={isPlus ? undefined : 'Plus로 업그레이드 →'}
              onPress={() => !isPlus && router.push('/paywall')}
              colors={colors}
              typography={typography}
              spacing={spacing}
            />
            <Pressable
              onPress={async () => {
                if (PURCHASES_MOCK) {
                  Alert.alert('구독 복원', isPlus ? '이미 Plus 구독 중이에요.' : '복원할 구독이 없어요.');
                  return;
                }
                setRestoring(true);
                try {
                  const restored = await restorePurchasesRC();
                  if (restored) {
                    // The webhook updates the server plan; show Plus now and re-read once it has landed
                    if (profile) setProfile({ ...profile, plan: 'plus' } as ProfileRow);
                    setTimeout(async () => {
                      if (!user) return;
                      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
                      if (data) setProfile(data as ProfileRow);
                    }, 5_000);
                    Alert.alert('복원 완료', '구독이 복원됐어요.');
                  } else {
                    Alert.alert('복원할 구독 없음', '활성 구독을 찾지 못했어요.');
                  }
                } catch {
                  Alert.alert('복원 오류', '다시 시도해 주세요.');
                } finally {
                  setRestoring(false);
                }
              }}
              disabled={restoring}
              style={[styles.row, { paddingVertical: spacing.base, borderBottomColor: colors.border }]}
              accessibilityRole="button"
            >
              <Text style={[styles.rowLabel, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
                구독 복원
              </Text>
              {restoring
                ? <ActivityIndicator size="small" color={colors.accent} />
                : <Text style={[styles.rowValue, { color: colors.subtext }]}>→</Text>}
            </Pressable>
          </>
        )}

        {/* Recording defaults */}
        <SectionHeader title="기록" colors={colors} typography={typography} />
        <Text style={[styles.modeLabel, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
          기본 기억 모드
        </Text>
        <View style={[styles.modeRow, { marginBottom: spacing.sm }]}>
          {MEMORY_MODE_OPTIONS.map((opt) => {
            const active = defaultMode === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => handleDefaultModeChange(opt.value)}
                style={[
                  styles.modeChip,
                  {
                    backgroundColor: active ? colors.accent : colors.surfaceAlt,
                    borderRadius: radius.full,
                    paddingVertical: spacing.xs,
                    paddingHorizontal: spacing.sm,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.modeChipText, { color: active ? '#fff' : colors.text, fontFamily: active ? typography.fontFamily.semiBold : typography.fontFamily.regular }]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.modeDesc, { color: colors.subtext, fontFamily: typography.fontFamily.regular, marginBottom: spacing.sm }]}>
          {MEMORY_MODE_OPTIONS.find((o) => o.value === defaultMode)?.desc}
        </Text>

        {/* Notifications */}
        <SectionHeader title="알림" colors={colors} typography={typography} />
        <SettingRow
          label="매일 알림"
          value={reminderLabel()}
          onPress={() => setReminderModalVisible(true)}
          colors={colors}
          typography={typography}
          spacing={spacing}
        />

        {/* Security */}
        {lockAvailable && (
          <>
            <SectionHeader title="잠금" colors={colors} typography={typography} />
            <View style={[styles.row, { paddingVertical: spacing.base, borderBottomColor: colors.border }]}>
              <Text style={[styles.rowLabel, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
                Face ID / 암호 잠금
              </Text>
              <Switch
                value={lockEnabled}
                onValueChange={handleLockToggle}
                trackColor={{ true: colors.accent }}
                accessibilityLabel="Face ID 잠금"
              />
            </View>
          </>
        )}

        {/* Export */}
        <SectionHeader title="데이터" colors={colors} typography={typography} />
        <Pressable
          onPress={handleExport}
          disabled={exporting}
          style={[styles.row, { paddingVertical: spacing.base, borderBottomColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="일기 내보내기"
        >
          <Text style={[styles.rowLabel, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
            일기 내보내기
          </Text>
          {exporting
            ? <ActivityIndicator size="small" color={colors.accent} />
            : <Text style={[styles.rowValue, { color: colors.subtext }]}>Markdown →</Text>
          }
        </Pressable>

        {/* Support */}
        <SectionHeader title="고객지원" colors={colors} typography={typography} />
        <SettingRow
          label="문의하기"
          value="→"
          onPress={() => Linking.openURL('https://muni-diary.vercel.app/')}
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
          onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}
          colors={colors}
          typography={typography}
          spacing={spacing}
        />
        <SettingRow
          label="이용약관"
          onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
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

      <ReminderModal
        visible={reminderModalVisible}
        currentTime={reminderTime}
        onDismiss={() => setReminderModalVisible(false)}
        onSaved={async (time) => {
          setReminderTime(time);
          if (user) {
            const { data } = await supabase
              .from('profiles')
              .update({ reminder_time: time })
              .eq('id', user.id)
              .select()
              .maybeSingle();
            if (data) setProfile(data as ProfileRow);
          }
        }}
      />
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
  modeLabel: { fontSize: 13, marginTop: 8, marginBottom: 6 },
  modeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeChip: {},
  modeChipText: { fontSize: 14 },
  modeDesc: { fontSize: 13 },
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
