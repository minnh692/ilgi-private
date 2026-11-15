import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { useAuthStore } from '@/stores/authStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { EditMemoryModal } from '@/components/EditMemoryModal';
import { EditPersonModal } from '@/components/EditPersonModal';
import type { Database } from '@/types/database';
import Constants from 'expo-constants';
import Pencil from '../../assets/brand/svg/muni-pencil.svg';
import Gear from '../../assets/brand/svg/muni-gear.svg';

type MemoryItem = Database['public']['Tables']['memory_items']['Row'];
type Person = Database['public']['Tables']['people']['Row'];

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl as string;

const CATEGORY_LABELS: Record<string, string> = {
  theme: '자주 등장하는 주제',
  person_pattern: '중요한 사람들',
  value_goal: '가치·목표',
  what_helps: '도움이 됐던 것',
  trigger: '힘들어지는 상황',
  preference: '취향·선호',
};

const CATEGORY_ORDER = ['theme', 'person_pattern', 'value_goal', 'what_helps', 'trigger', 'preference'];

// ─── Evidence chips ────────────────────────────────────────────────────────────

function EvidenceChips({ ids, dateMap }: { ids: string[]; dateMap: Record<string, string> }) {
  const { colors } = useTheme();
  const visible = ids.slice(0, 3);
  const extra = ids.length - visible.length;
  return (
    <View style={styles.chipsRow}>
      {visible.map((id) => {
        const date = dateMap[id];
        const label = date
          ? new Date(date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
          : '?';
        return (
          <Text key={id} style={[styles.chip, { color: colors.subtext, borderColor: colors.border }]}>
            {label}
          </Text>
        );
      })}
      {extra > 0 && (
        <Text style={[styles.chip, { color: colors.subtext, borderColor: colors.border }]}>
          +{extra}
        </Text>
      )}
    </View>
  );
}

// ─── Memory item row ──────────────────────────────────────────────────────────

function MemoryItemRow({
  item,
  dateMap,
  onEdit,
  onDismiss,
  onDelete,
}: {
  item: MemoryItem;
  dateMap: Record<string, string>;
  onEdit: () => void;
  onDismiss: () => void;
  onDelete: () => void;
}) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={[styles.itemRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.itemContent, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
        {item.content}
      </Text>
      <View style={styles.itemFooter}>
        <EvidenceChips ids={item.evidence_entry_ids} dateMap={dateMap} />
        <View style={styles.itemActions}>
          <Pressable onPress={onEdit} hitSlop={8} accessibilityLabel="수정">
            <Text style={[styles.actionText, { color: colors.accent }]}>수정</Text>
          </Pressable>
          <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel="아니에요">
            <Text style={[styles.actionText, { color: colors.subtext }]}>아니에요</Text>
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel="삭제">
            <Text style={[styles.actionText, { color: colors.error }]}>삭제</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Person card ───────────────────────────────────────────────────────────────

function PersonCard({
  person,
  mergeMode,
  onEdit,
  onMerge,
  onDelete,
  onSelectMergeTarget,
}: {
  person: Person;
  mergeMode: boolean;
  onEdit: () => void;
  onMerge: () => void;
  onDelete: () => void;
  onSelectMergeTarget: () => void;
}) {
  const { colors, typography, radius } = useTheme();
  return (
    <Pressable
      onPress={mergeMode ? onSelectMergeTarget : undefined}
      style={[
        styles.personCard,
        {
          backgroundColor: mergeMode ? colors.accentLight : colors.surface,
          borderRadius: radius.md,
          borderColor: mergeMode ? colors.accent : colors.border,
        },
      ]}
    >
      <View style={styles.personMain}>
        <Text style={[styles.personName, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
          {person.display_name}
        </Text>
        {person.relation ? (
          <Text style={[styles.personMeta, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            {person.relation}
          </Text>
        ) : null}
        <Text style={[styles.personMeta, { color: colors.softGray, fontFamily: typography.fontFamily.regular }]}>
          {person.mention_count}번 언급
        </Text>
      </View>
      {!mergeMode && (
        <View style={styles.personActions}>
          <Pressable onPress={onEdit} hitSlop={8} accessibilityLabel="수정">
            <Text style={[styles.actionText, { color: colors.accent }]}>수정</Text>
          </Pressable>
          <Pressable onPress={onMerge} hitSlop={8} accessibilityLabel="통합">
            <Text style={[styles.actionText, { color: colors.subtext }]}>통합</Text>
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel="삭제">
            <Text style={[styles.actionText, { color: colors.error }]}>삭제</Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function ProfileTab() {
  const { colors, typography, spacing } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  // Modal state
  const [editingItem, setEditingItem] = useState<MemoryItem | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [mergingPerson, setMergingPerson] = useState<Person | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: memoryItems = [] } = useQuery({
    queryKey: ['memory_items', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('memory_items')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['active', 'user_edited'])
        .order('confidence', { ascending: false });
      if (error) throw error;
      return data as MemoryItem[];
    },
    enabled: !!user,
  });

  const { data: people = [] } = useQuery({
    queryKey: ['people', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .eq('user_id', user.id)
        .order('mention_count', { ascending: false });
      if (error) throw error;
      return data as Person[];
    },
    enabled: !!user,
  });

  const { data: entryDateMap = {} } = useQuery<Record<string, string>>({
    queryKey: ['entry_dates', user?.id],
    queryFn: async () => {
      if (!user) return {};
      const { data } = await supabase
        .from('entries')
        .select('id, entry_date')
        .eq('user_id', user.id);
      return Object.fromEntries((data ?? []).map((e) => [e.id, e.entry_date]));
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from('memory_items')
        .update({ content, status: 'user_edited' })
        .eq('id', id)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory_items', user?.id] }),
  });

  const dismissItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('memory_items')
        .update({ status: 'dismissed' })
        .eq('id', id)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory_items', user?.id] }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('memory_items')
        .delete()
        .eq('id', id)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory_items', user?.id] }),
  });

  const updatePersonMutation = useMutation({
    mutationFn: async (data: {
      id: string; display_name: string; relation: string; notes: string; aliases: string[];
    }) => {
      const { error } = await supabase
        .from('people')
        .update({
          display_name: data.display_name,
          relation: data.relation || null,
          notes: data.notes || null,
          aliases: data.aliases,
        })
        .eq('id', data.id)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['people', user?.id] }),
  });

  const deletePersonMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('people').delete().eq('id', id).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['people', user?.id] }),
  });

  const mergePeopleMutation = useMutation({
    mutationFn: async ({ source_id, target_id }: { source_id: string; target_id: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/memory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'merge_people', source_id, target_id }),
      });
      if (!res.ok) throw new Error('Merge failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['people', user?.id] });
      setMergingPerson(null);
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/memory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'delete_all' }),
      });
      if (!res.ok) throw new Error('Delete all failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memory_items', user?.id] });
      qc.invalidateQueries({ queryKey: ['people', user?.id] });
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleDismiss(item: MemoryItem) {
    Alert.alert(
      '이건 아니에요',
      '이 내용을 더 이상 기억하지 않을게요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '확인', onPress: () => dismissItemMutation.mutate(item.id) },
      ],
    );
  }

  function handleDeleteItem(item: MemoryItem) {
    Alert.alert(
      '기억 삭제',
      '이 항목을 삭제할까요?',
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => deleteItemMutation.mutate(item.id) },
      ],
    );
  }

  function handleDeletePerson(person: Person) {
    Alert.alert(
      `${person.display_name} 삭제`,
      '이 사람을 기억에서 지울까요?',
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => deletePersonMutation.mutate(person.id) },
      ],
    );
  }

  function handleDeleteAll() {
    Alert.alert(
      '모든 기억 삭제',
      'AI가 기억하는 모든 내용과 사람 정보가 삭제돼요. 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '모두 삭제',
          style: 'destructive',
          onPress: () => deleteAllMutation.mutate(),
        },
      ],
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const grouped = memoryItems.reduce<Record<string, MemoryItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const hasAnyMemory = memoryItems.length > 0 || people.length > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarSpace + 32 }}>
        {/* Header */}
        <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
          <Text style={[styles.headerTitle, { color: colors.text, fontFamily: typography.fontFamily.bold }]}>
            AI가 본 나
          </Text>
          <Link href="/settings" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel="설정">
              <Gear width={24} height={24} color={colors.text} />
            </Pressable>
          </Link>
        </View>

        <View style={{ paddingHorizontal: spacing.base, marginTop: spacing.sm }}>
          {!hasAnyMemory ? (
            <View style={[styles.empty, { paddingTop: spacing['3xl'] }]}>
              <Pencil width={80} height={80} style={styles.emptyArt} accessibilityElementsHidden importantForAccessibility="no" />
              <Text style={[styles.emptyText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
                일기를 쓰면 무늬가 나에 대해{'\n'}기억하기 시작해요.
              </Text>
            </View>
          ) : (
            <>
              {/* Memory items by category */}
              {CATEGORY_ORDER.map((cat) => {
                const items = grouped[cat];
                if (!items?.length) return null;
                return (
                  <View key={cat} style={{ marginBottom: spacing.xl }}>
                    <Text style={[styles.sectionTitle, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
                      {CATEGORY_LABELS[cat]}
                    </Text>
                    {items.map((item) => (
                      <MemoryItemRow
                        key={item.id}
                        item={item}
                        dateMap={entryDateMap}
                        onEdit={() => setEditingItem(item)}
                        onDismiss={() => handleDismiss(item)}
                        onDelete={() => handleDeleteItem(item)}
                      />
                    ))}
                  </View>
                );
              })}

              {/* People section */}
              {people.length > 0 && (
                <View style={{ marginBottom: spacing.xl }}>
                  <View style={styles.peopleSectionHeader}>
                    <Text style={[styles.sectionTitle, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
                      사람들
                    </Text>
                    {mergingPerson && (
                      <Pressable onPress={() => setMergingPerson(null)}>
                        <Text style={[{ color: colors.accent, fontFamily: typography.fontFamily.medium, fontSize: 13 }]}>
                          취소
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  {mergingPerson && (
                    <Text style={[styles.mergeHint, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
                      &quot;{mergingPerson.display_name}&quot;과 통합할 사람을 선택해 주세요
                    </Text>
                  )}
                  {people.map((person) => (
                    <PersonCard
                      key={person.id}
                      person={person}
                      mergeMode={!!mergingPerson && mergingPerson.id !== person.id}
                      onEdit={() => setEditingPerson(person)}
                      onMerge={() => setMergingPerson(person)}
                      onDelete={() => handleDeletePerson(person)}
                      onSelectMergeTarget={() => {
                        if (!mergingPerson) return;
                        Alert.alert(
                          '사람 통합',
                          `"${mergingPerson.display_name}"을(를) "${person.display_name}"으로 통합할까요? 되돌릴 수 없어요.`,
                          [
                            { text: '취소', style: 'cancel' },
                            {
                              text: '통합',
                              style: 'destructive',
                              onPress: () => mergePeopleMutation.mutate({ source_id: mergingPerson.id, target_id: person.id }),
                            },
                          ],
                        );
                      }}
                    />
                  ))}
                </View>
              )}

              {/* Delete all button */}
              <Pressable
                onPress={handleDeleteAll}
                style={[styles.deleteAllBtn, { borderColor: colors.error }]}
                accessibilityRole="button"
                accessibilityLabel="모든 기억 삭제"
              >
                <Text style={[styles.deleteAllText, { color: colors.error, fontFamily: typography.fontFamily.medium }]}>
                  모든 기억 삭제
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>

      {/* Modals */}
      <EditMemoryModal
        visible={!!editingItem}
        initialContent={editingItem?.content ?? ''}
        onSave={(content) => {
          if (!editingItem) return;
          updateItemMutation.mutate({ id: editingItem.id, content });
          setEditingItem(null);
        }}
        onCancel={() => setEditingItem(null)}
      />

      <EditPersonModal
        visible={!!editingPerson}
        person={editingPerson}
        onSave={(data) => {
          if (!editingPerson) return;
          updatePersonMutation.mutate({ id: editingPerson.id, ...data });
          setEditingPerson(null);
        }}
        onCancel={() => setEditingPerson(null)}
      />

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
  sectionTitle: { fontSize: 12, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  itemRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  itemContent: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  itemFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemActions: { flexDirection: 'row', gap: 12 },
  actionText: { fontSize: 13 },
  chipsRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', flex: 1, marginRight: 8 },
  chip: { fontSize: 11, borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  personCard: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8, borderWidth: 1 },
  personMain: { flex: 1 },
  personName: { fontSize: 15, marginBottom: 2 },
  personMeta: { fontSize: 12, lineHeight: 18 },
  personActions: { flexDirection: 'row', gap: 12 },
  peopleSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  mergeHint: { fontSize: 13, marginBottom: 10 },
  empty: { alignItems: 'center' },
  emptyArt: { marginBottom: 16 },
  emptyText: { fontSize: 15, lineHeight: 24, textAlign: 'center' },
  deleteAllBtn: { borderWidth: 1, borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  deleteAllText: { fontSize: 15 },
});
