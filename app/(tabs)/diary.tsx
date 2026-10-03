import { View, Text, StyleSheet, FlatList, TouchableOpacity, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Database } from '@/types/database';

type Entry = Database['public']['Tables']['entries']['Row'];

const MOOD_COLORS = ['#E07A5F', '#F4C842', '#7EC8A4', '#7EB5D4', '#C39BD3'] as const;
const MOOD_EMOJI = ['😠', '😕', '😊', '😌', '😄'] as const;

function MoodDot({ mood }: { mood: number | null }) {
  if (mood == null) return null;
  return (
    <View
      style={[styles.moodDot, { backgroundColor: MOOD_COLORS[mood - 1] ?? '#ccc' }]}
      accessibilityLabel={`기분 ${mood}`}
    />
  );
}

function EntryCard({ entry }: { entry: Entry }) {
  const { colors, typography, spacing, radius, shadow } = useTheme();
  const preview = entry.content.slice(0, 80) + (entry.content.length > 80 ? '…' : '');
  const dateStr = new Date(entry.entry_date).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

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
        accessibilityLabel={`${dateStr} 일기`}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.cardDate, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
            {dateStr}
          </Text>
          <MoodDot mood={entry.mood} />
        </View>
        <Text
          style={[styles.cardPreview, { color: colors.text, fontFamily: typography.fontFamily.regular }]}
          numberOfLines={2}
        >
          {preview}
        </Text>
      </Pressable>
    </Link>
  );
}

function EmptyDiary() {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={[styles.empty, { paddingTop: spacing['3xl'] }]}>
      <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
        오늘 하루 어떠셨나요?
      </Text>
      <Text style={[styles.emptyHint, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
        첫 번째 일기를 써 보세요.{'\n'}AI가 따뜻한 답장을 드려요.
      </Text>
    </View>
  );
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
        .select('*')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false });
      if (error) throw error;
      return data as Entry[];
    },
    enabled: !!user,
  });

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
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EntryCard entry={item} />}
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
  header: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 28 },
  card: {},
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardDate: { fontSize: 13 },
  cardPreview: { fontSize: 15, lineHeight: 22 },
  moodDot: { width: 10, height: 10, borderRadius: 5 },
  empty: { flex: 1, alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, marginBottom: 12, textAlign: 'center' },
  emptyHint: { fontSize: 15, lineHeight: 24, textAlign: 'center' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3D2B1F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabIcon: { fontSize: 22 },
});
