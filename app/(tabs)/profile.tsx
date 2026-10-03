import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

type MemoryItem = Database['public']['Tables']['memory_items']['Row'];

const CATEGORY_LABELS: Record<MemoryItem['category'], string> = {
  theme: '자주 등장하는 주제',
  person_pattern: '중요한 사람들',
  value_goal: '가치·목표',
  what_helps: '도움이 됐던 것',
  trigger: '힘들어지는 상황',
  preference: '취향·선호',
};

function MemorySection({ category, items }: { category: MemoryItem['category']; items: MemoryItem[] }) {
  const { colors, typography, spacing } = useTheme();
  if (items.length === 0) return null;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={[styles.sectionTitle, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
        {CATEGORY_LABELS[category]}
      </Text>
      {items.map((item) => (
        <View key={item.id} style={[styles.memoryItem, { borderBottomColor: colors.border }]}>
          <Text style={[styles.memoryContent, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
            {item.content}
          </Text>
          <View style={styles.memoryActions}>
            {item.evidence_entry_ids.map((id) => (
              <Text key={id} style={[styles.evidenceChip, { color: colors.subtext, borderColor: colors.border }]}>
                {new Date(id).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
              </Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export default function ProfileTab() {
  const { colors, typography, spacing } = useTheme();
  const user = useAuthStore((s) => s.user);

  const { data: memoryItems = [] } = useQuery({
    queryKey: ['memory_items', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('memory_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('confidence', { ascending: false });
      if (error) throw error;
      return data as MemoryItem[];
    },
    enabled: !!user,
  });

  const grouped = memoryItems.reduce<Partial<Record<MemoryItem['category'], MemoryItem[]>>>(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category]!.push(item);
      return acc;
    },
    {}
  );

  const categories: MemoryItem['category'][] = [
    'theme', 'person_pattern', 'value_goal', 'what_helps', 'trigger',
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
          <Text style={[styles.headerTitle, { color: colors.text, fontFamily: typography.fontFamily.bold }]}>
            AI가 본 나
          </Text>
          <Link href="/settings" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel="설정">
              <Text style={{ fontSize: 24 }}>⚙️</Text>
            </Pressable>
          </Link>
        </View>

        <View style={{ paddingHorizontal: spacing.base, marginTop: spacing.sm }}>
          {memoryItems.length === 0 ? (
            <View style={[styles.empty, { paddingTop: spacing['3xl'] }]}>
              <Text style={[styles.emptyText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
                일기를 쓰면 AI가 나에 대해{'\n'}기억하기 시작해요.
              </Text>
            </View>
          ) : (
            categories.map((cat) => (
              <MemorySection
                key={cat}
                category={cat}
                items={grouped[cat] ?? []}
              />
            ))
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
  sectionTitle: { fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  memoryItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memoryContent: { fontSize: 15, lineHeight: 22, marginBottom: 6 },
  memoryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  evidenceChip: {
    fontSize: 11,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  empty: { alignItems: 'center' },
  emptyText: { fontSize: 15, lineHeight: 24, textAlign: 'center' },
});
