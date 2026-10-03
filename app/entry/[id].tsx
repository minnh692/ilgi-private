import { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { SavePrompt } from '../components/SavePrompt';
import type { Database } from '@/types/database';
import Constants from 'expo-constants';

type Entry = Database['public']['Tables']['entries']['Row'];
type Reply = Database['public']['Tables']['replies']['Row'];

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl as string;

function ReplyCard({ reply, isFirstEntry }: { reply: Reply; isFirstEntry: boolean }) {
  const { colors, typography, spacing, radius, shadow } = useTheme();
  const qc = useQueryClient();

  const rateMutation = useMutation({
    mutationFn: async (rating: number) => {
      const { error } = await supabase
        .from('replies')
        .update({ rating: rating as number | null })
        .eq('id', reply.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reply', reply.entry_id] }),
  });

  // "기억해둘게요" block — shown only on the first entry in remember mode
  const memoryNote = isFirstEntry && reply.kind === 'normal' ? extractMemoryNote(reply.content) : null;

  return (
    <View
      style={[
        styles.replyCard,
        {
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.lg,
          padding: spacing.xl,
          ...shadow.sm,
        },
      ]}
    >
      <Text style={[styles.replyLabel, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
        AI가 쓴 답장
      </Text>
      <Text style={[styles.replyContent, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
        {reply.content}
      </Text>

      {memoryNote && (
        <View style={[styles.memoryNote, { backgroundColor: colors.accentLight, borderRadius: radius.md }]}>
          <Text style={[styles.memoryNoteTitle, { color: colors.accent, fontFamily: typography.fontFamily.semiBold }]}>
            기억해둘게요 📝
          </Text>
          <Text style={[styles.memoryNoteBody, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
            {memoryNote}
          </Text>
        </View>
      )}

      <View style={styles.ratingRow}>
        {[
          { rating: 1, label: '도움이 됐어요', emoji: '👍' },
          { rating: -1, label: '별로예요', emoji: '👎' },
        ].map(({ rating, label, emoji }) => (
          <Pressable
            key={rating}
            onPress={() => rateMutation.mutate(rating)}
            style={[
              styles.ratingBtn,
              {
                borderColor: reply.rating === rating ? colors.accent : colors.border,
                borderRadius: radius.full,
                backgroundColor: reply.rating === rating ? colors.accentLight : 'transparent',
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <Text style={styles.ratingEmoji}>{emoji}</Text>
            <Text style={[styles.ratingLabel, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Extracts 2 concrete things the AI will remember (for first-entry block).
// In production the prompt should structure these; here we show a friendly placeholder.
function extractMemoryNote(content: string): string {
  const sentences = content.split(/[.。]/g).map((s) => s.trim()).filter(Boolean);
  const picks = sentences.slice(0, 2).join('. ');
  return picks ? `오늘 일기에서 기억해둘 것들을 정리했어요.\n• 오늘 겪은 일과 감정\n• 앞으로 답장에 참고할게요` : '';
}

function GeneratingReply() {
  const { colors, typography, spacing, radius } = useTheme();
  return (
    <View
      style={[
        styles.generatingCard,
        {
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.lg,
          padding: spacing.xl,
        },
      ]}
    >
      <ActivityIndicator color={colors.accent} />
      <Text style={[styles.generatingText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
        답장을 쓰고 있어요...
      </Text>
    </View>
  );
}

export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, typography, spacing, radius, shadow } = useTheme();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const qc = useQueryClient();

  const [savePromptVisible, setSavePromptVisible] = useState(false);

  const isAnonymous = user?.is_anonymous ?? true;

  const { data: entry, isLoading: entryLoading } = useQuery({
    queryKey: ['entry', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entries')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Entry;
    },
    enabled: !!id,
  });

  const { data: reply, isLoading: replyLoading } = useQuery({
    queryKey: ['reply', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('replies')
        .select('*')
        .eq('entry_id', id)
        .maybeSingle();
      if (error) throw error;
      return data as Reply | null;
    },
    enabled: !!id,
    refetchInterval: (query) => (query.state.data == null ? 3000 : false),
    refetchIntervalInBackground: false,
  });

  // Show save prompt after reply appears (first entry) or after 3rd entry
  useEffect(() => {
    if (!reply || !isAnonymous) return;
    const state = (profile?.onboarding_state as Record<string, unknown>) ?? {};
    const savePromptShown = state.savePromptShown as boolean | undefined;
    const entryCount = state.entryCount as number | undefined;

    const isFirstEntry = !savePromptShown;
    const isThirdEntry = !savePromptShown && (entryCount ?? 0) >= 3;

    if (isFirstEntry || isThirdEntry) {
      const timer = setTimeout(() => setSavePromptVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [reply?.id, isAnonymous]);

  async function markSavePromptShown() {
    setSavePromptVisible(false);
    if (!user) return;
    const current = (profile?.onboarding_state as Record<string, unknown>) ?? {};
    const { data } = await supabase
      .from('profiles')
      .update({ onboarding_state: { ...current, savePromptShown: true } })
      .eq('id', user.id)
      .select()
      .maybeSingle();
    if (data) setProfile(data as typeof profile);
  }

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/generate-reply`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ entryId: id }),
        }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Failed to generate reply');
      }
      return response.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reply', id] }),
    onError: (err: Error) => {
      if (err.message === 'quota_exceeded') {
        router.push('/paywall');
      }
    },
  });

  const hasTriggered = useRef(false);
  if (entry && !replyLoading && reply === null && !generateMutation.isPending && !hasTriggered.current) {
    hasTriggered.current = true;
    if (entry.memory_mode !== 'private') {
      generateMutation.mutate();
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries', user?.id] });
      router.back();
    },
  });

  function confirmDelete() {
    Alert.alert('일기 삭제', '이 일기를 삭제할까요? 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }

  // Count total entries to know if this is the first
  const { data: entryCount = 0 } = useQuery({
    queryKey: ['entry_count', user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id);
      return count ?? 0;
    },
    enabled: !!user,
  });

  if (entryLoading || !entry) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.accent} />
      </SafeAreaView>
    );
  }

  const dateStr = new Date(entry.entry_date).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const isFirstEntry = entryCount <= 1;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { paddingHorizontal: spacing.base, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="뒤로"
        >
          <Text style={[styles.backBtn, { color: colors.accent, fontFamily: typography.fontFamily.medium }]}>
            ← 뒤로
          </Text>
        </Pressable>
        <Pressable onPress={confirmDelete} accessibilityRole="button" accessibilityLabel="삭제">
          <Text style={[styles.deleteBtn, { color: colors.error, fontFamily: typography.fontFamily.regular }]}>
            삭제
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.base, paddingTop: spacing.base, paddingBottom: 48 }}
      >
        <Text style={[styles.dateStr, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
          {dateStr}
        </Text>

        <View
          style={[
            styles.entryBox,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              padding: spacing.base,
              marginTop: spacing.sm,
              marginBottom: spacing.xl,
              ...shadow.sm,
            },
          ]}
        >
          <Text style={[styles.entryContent, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
            {entry.content}
          </Text>
        </View>

        {entry.memory_mode !== 'private' && (
          <>
            {generateMutation.isPending || (replyLoading && reply === null) ? (
              <GeneratingReply />
            ) : reply ? (
              <ReplyCard reply={reply} isFirstEntry={isFirstEntry && entry.memory_mode === 'remember'} />
            ) : null}
          </>
        )}
      </ScrollView>

      <SavePrompt
        visible={savePromptVisible}
        onDismiss={markSavePromptShown}
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
  backBtn: { fontSize: 16 },
  deleteBtn: { fontSize: 14 },
  dateStr: { fontSize: 14, marginBottom: 4 },
  entryBox: {},
  entryContent: { fontSize: 16, lineHeight: 28 },
  replyCard: {},
  replyLabel: { fontSize: 12, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  replyContent: { fontSize: 16, lineHeight: 28, marginBottom: 20 },
  memoryNote: { padding: 14, marginBottom: 16 },
  memoryNoteTitle: { fontSize: 14, marginBottom: 6 },
  memoryNoteBody: { fontSize: 14, lineHeight: 21 },
  ratingRow: { flexDirection: 'row', gap: 10 },
  ratingBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1 },
  ratingEmoji: { fontSize: 18 },
  ratingLabel: { fontSize: 13 },
  generatingCard: { alignItems: 'center', gap: 12 },
  generatingText: { fontSize: 15, marginTop: 4 },
});
