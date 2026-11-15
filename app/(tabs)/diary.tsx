import { useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, Pressable, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTheme } from '@/theme/useTheme';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Database, MemoryMode } from '@/types/database';
import { palette } from '@/theme/tokens';
import { ModeIcon } from '@/components/ModeIcon';
import Pencil from '../../assets/brand/svg/muni-pencil.svg';

type EntryRow = Database['public']['Tables']['entries']['Row'];
type EntryWithReply = EntryRow & { replies: { id: string }[] };

// Timeline loads in pages so a long diary history isn't fetched all at once
const PAGE_SIZE = 30;

const MOOD_COLORS = ['#E07A5F', '#F4C842', '#7EC8A4', '#7EB5D4', '#C39BD3'] as const;
const MODE_LABEL: Record<string, string> = {
  remember: '기억하고 답장',
  reply_only: '답장만',
  private: '나만 보기',
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
        style={StyleSheet.flatten([
          styles.card,
          {
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            padding: spacing.base,
            marginHorizontal: spacing.base,
            marginBottom: spacing.sm,
            ...shadow.sm,
          },
        ])}
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
            <ModeIcon
              mode={entry.memory_mode as MemoryMode}
              size={16}
              color={colors.subtext}
              accessibilityLabel={`기록 방식: ${MODE_LABEL[entry.memory_mode] ?? entry.memory_mode}`}
            />
          </View>
        </View>
        {entry.title ? (
          <Text
            style={[styles.cardTitle, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}
            numberOfLines={1}
          >
            {entry.title}
          </Text>
        ) : null}
        <Text
          style={[styles.cardPreview, { color: entry.title ? colors.subtext : colors.text, fontFamily: typography.fontFamily.regular }]}
          numberOfLines={entry.title ? 2 : 3}
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
      <Pencil width={96} height={96} style={styles.emptyArt} accessibilityElementsHidden importantForAccessibility="no" />
      <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
        오늘 하루 어떠셨나요?
      </Text>
      <Text style={[styles.emptyPrompt, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
        {prompt}
      </Text>
      <Text style={[styles.emptyHint, { color: colors.softGray, fontFamily: typography.fontFamily.regular }]}>
        AI 고양이 무늬가 따뜻한 답장을 써드려요.
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
  const tabBarSpace = useTabBarSpace();
  const user = useAuthStore((s) => s.user);

  const {
    data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['entries', user?.id],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('entries')
        .select('*, replies(id)')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;
      return (data as unknown) as EntryWithReply[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
    enabled: !!user,
  });

  // Offset paging can repeat a row if an entry is added mid-scroll — dedupe by id
  const entries = useMemo(() => {
    const seen = new Set<string>();
    return (data?.pages.flat() ?? []).filter((e) => !seen.has(e.id) && !!seen.add(e.id));
  }, [data]);

  const sections = useMemo(() => groupByDate(entries), [entries]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily: typography.fontFamily.bold }]}>
          일기
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <Text style={[styles.loadingText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            불러오는 중...
          </Text>
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            불러오지 못했어요
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={[styles.retryBtn, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="다시 시도"
          >
            <Text style={[styles.retryText, { color: colors.accent, fontFamily: typography.fontFamily.medium }]}>
              다시 시도
            </Text>
          </Pressable>
        </View>
      ) : entries.length === 0 ? (
        <EmptyDiary />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EntryCard entry={item} />}
          renderSectionHeader={({ section }) => <DateHeader title={section.title} />}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: tabBarSpace + 92 }}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: spacing.base }} color={colors.accent} /> : null}
        />
      )}

      <Link href="/write" asChild>
        <TouchableOpacity
          style={StyleSheet.flatten([styles.fab, { bottom: tabBarSpace + 12, backgroundColor: palette.muzzle, borderColor: palette.ink }])}
          accessibilityRole="button"
          accessibilityLabel="새 일기 쓰기"
        >
          <Pencil width={36} height={36} />
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
  cardTitle: { fontSize: 16, lineHeight: 23, marginBottom: 2 },
  cardPreview: { fontSize: 15, lineHeight: 23 },
  moodDot: { width: 10, height: 10, borderRadius: 5 },
  replyDot: { width: 7, height: 7, borderRadius: 3.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 15 },
  errorText: { fontSize: 15 },
  retryBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  retryText: { fontSize: 15 },
  empty: { flex: 1, alignItems: 'center' },
  emptyArt: { marginBottom: 20 },
  emptyTitle: { fontSize: 20, marginBottom: 12, textAlign: 'center' },
  emptyPrompt: { fontSize: 16, lineHeight: 25, textAlign: 'center', marginBottom: 10 },
  emptyHint: { fontSize: 14, textAlign: 'center' },
  fab: {
    position: 'absolute', right: 24,
    width: 60, height: 60, borderRadius: 30, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: palette.ink, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
});
