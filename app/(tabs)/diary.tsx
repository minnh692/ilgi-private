import { useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Database } from '@/types/database';

type EntryRow = Database['public']['Tables']['entries']['Row'];
type EntryWithReply = EntryRow & { replies: { id: string }[] };

const MOOD_COLORS = ['#E07A5F', '#F4C842', '#7EC8A4', '#7EB5D4', '#C39BD3'] as const;
const MODE_ICON: Record<string, string> = {
  remember: '🧠',
  reply_only: '💬',
  private: '🔒',
};

function MoodDot({ mood }: { mood: number | null }) {
  if (mood == null) return null;
  return (
    <View
      style={[styles.moodDot, { backgroundColor: MOOD_COLORS[(mood - 1) as number] ?? '#ccc' }]}
      accessibilityLabel={`기분 ${mood}`}
    />
  );
}

function EntryCard({ entry }: { entry: EntryWithReply }) {
  const { colors, typography, spacing, radius, shadow } = useTheme();
  const preview = entry.content.slice(0, 100) + (entry.content.length > 100 ? '…' : '');
  const hasReply = entry.replies.length > 0;

  return (
    <Link href={`/entry/${entry.id}`} asChild>
      <Pressable
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            padding: spacing.base,
            marginHorizontal: spacing.base,
            marginBottom: spacing.sm,
            ...shadow.sm,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="일기 보기"
      >
        <View style={styles.cardMeta}>
          <MoodDot mood={entry.mood} />
          <View style={styles.cardIcons}>
            {hasReply && (
              <View style={[styles.replyDot, { backgroundColor: colors.accent }]}
                accessibilityLabel="AI 답장 있음"
              />
            )}
            <Text style={styles.modeIcon} accessibilityLabel={`기록 방식: ${entry.memory_mode}`}>
              {MODE_ICON[entry.memory_mode] ?? ''}
            </Text>
          </View>
        </View>
        <Text
          style={[styles.cardPreview, { color: colors.text, fontFamily: typography.fontFamily.regular }]}
          numberOfLines={3}
        >
          {preview}
        </Text>
      </Pressable>
    </Link>
  );
}

function DateHeader({ title }: { title: string }) {
  const { colors, typography, spacing } = useTheme();
  return (
    <Text style={[
      styles.dateHeader,
      { color: colors.subtext, fontFamily: typography.fontFamily.medium, paddingHorizontal: spacing.base },
    ]}>
      {title}
    </Text>
  );
}

function EmptyDiary() {
  const { colors, typography, spacing } = useTheme();
  const prompts = [
    '오늘 가장 마음에 남은 일은 뭐였어요?',
    '오늘 어떤 감정이 가장 강하게 느껴졌나요?',
    '오늘 나에게 고마운 것이 있다면?',
  ];
  const prompt = prompts[new Date().getDay() % prompts.length];

  return (
    <View style={[styles.empty, { paddingTop: spacing['3xl'], paddingHorizontal: spacing.xl }]}>
      <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
        오늘 하루 어떠셨나요?
      </Text>
      <Text style={[styles.emptyPrompt, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
        {prompt}
      </Text>
      <Text style={[styles.emptyHint, { color: colors.softGray, fontFamily: typography.fontFamily.regular }]}>
        AI가 따뜻한 답장을 써드려요.
      </Text>
    </View>
  );
}

type Section = { title: string; data: EntryWithReply[] };

function groupByDate(entries: EntryWithReply[]): Section[] {
  const map = new Map<string, EntryWithReply[]>();
  for (const entry of entries) {
    const label = new Date(entry.entry_date).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    });
    const existing = map.get(label) ?? [];
    existing.push(entry);
    map.set(label, existing);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

export default function DiaryTab() {
  const { colors, typography, spacing } = useTheme();
  const user = useAuthStore((s) => s.user);

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('entries')
        .select('*, replies(id)')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown) as EntryWithReply[];
    },
    enabled: !!user,
  });

  const sections = useMemo(() => groupByDate(entries), [entries]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily: typography.fontFamily.bold }]}>
          일기
        </Text>
      </View>

      {entries.length === 0 ? (
        <EmptyDiary />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EntryCard entry={item} />}
          renderSectionHeader={({ section }) => <DateHeader title={section.title} />}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: 100 }}
        />
      )}

      <Link href="/write" asChild>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.accent }]}
          accessibilityRole="button"
          accessibilityLabel="새 일기 쓰기"
        >
          <Text style={styles.fabIcon}>✏️</Text>
        </TouchableOpacity>
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 28 },
  dateHeader: { fontSize: 13, marginTop: 20, marginBottom: 8 },
  card: {},
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardIcons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardPreview: { fontSize: 15, lineHeight: 23 },
  moodDot: { width: 10, height: 10, borderRadius: 5 },
  replyDot: { width: 7, height: 7, borderRadius: 3.5 },
  modeIcon: { fontSize: 13 },
  empty: { flex: 1, alignItems: 'center' },
  emptyTitle: { fontSize: 20, marginBottom: 12, textAlign: 'center' },
  emptyPrompt: { fontSize: 16, lineHeight: 25, textAlign: 'center', marginBottom: 10 },
  emptyHint: { fontSize: 14, textAlign: 'center' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#3D2B1F', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  fabIcon: { fontSize: 22 },
});
