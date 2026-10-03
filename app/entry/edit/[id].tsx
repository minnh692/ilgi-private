import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  Pressable, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Database } from '@/types/database';

type EntryRow = Database['public']['Tables']['entries']['Row'];
type MemoryMode = 'remember' | 'reply_only' | 'private';

const MOOD_EMOJIS = ['😔', '😕', '😊', '🙂', '😄'];
const MEMORY_MODES: { mode: MemoryMode; label: string; desc: string }[] = [
  { mode: 'remember', label: '기억하고 답장', desc: 'AI가 답장을 쓰고 내용을 기억해요' },
  { mode: 'reply_only', label: '답장만', desc: 'AI가 답장을 쓰지만 기억하지 않아요' },
  { mode: 'private', label: '나만 보기', desc: 'AI에게 전송하지 않아요' },
];

async function cleanupInsights(entryId: string, userId: string) {
  await supabase.from('entry_insights').delete().eq('entry_id', entryId);

  const { data: items } = await supabase
    .from('memory_items')
    .select('id, evidence_entry_ids')
    .eq('user_id', userId);

  for (const item of items ?? []) {
    const ids = item.evidence_entry_ids as string[];
    if (!ids.includes(entryId)) continue;
    const updated = ids.filter((id) => id !== entryId);
    if (updated.length === 0) {
      await supabase.from('memory_items').delete().eq('id', item.id);
    } else {
      await supabase.from('memory_items').update({ evidence_entry_ids: updated }).eq('id', item.id);
    }
  }
}

export default function EditEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, typography, spacing, radius } = useTheme();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();
  const inputRef = useRef<TextInput>(null);

  const [content, setContent] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [memoryMode, setMemoryMode] = useState<MemoryMode>('remember');

  const hasConsent = !!profile?.consent_ai_at;

  const { data: entry, isLoading } = useQuery({
    queryKey: ['entry', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entries').select('*').eq('id', id).single();
      if (error) throw error;
      return data as EntryRow;
    },
    enabled: !!id,
  });

  // Populate form with existing entry data
  useEffect(() => {
    if (entry) {
      setContent(entry.content);
      setMood(entry.mood);
      setMemoryMode(entry.memory_mode as MemoryMode);
    }
  }, [entry?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!entry || !user) throw new Error('No entry');

      const prevMode = entry.memory_mode as MemoryMode;
      const nextMode: MemoryMode = hasConsent ? memoryMode : 'private';
      const modeChangedAwayFromRemember = prevMode === 'remember' && nextMode !== 'remember';

      const { error } = await supabase
        .from('entries')
        .update({ content: content.trim(), mood, memory_mode: nextMode })
        .eq('id', id);
      if (error) throw error;

      // Clean up memory if mode switched away from remember
      if (modeChangedAwayFromRemember) {
        await cleanupInsights(id!, user.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entry', id] });
      qc.invalidateQueries({ queryKey: ['entries', user?.id] });
      router.back();
    },
    onError: () => Alert.alert('저장 오류', '다시 시도해 주세요.'),
  });

  if (isLoading || !entry) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.accent} />
      </SafeAreaView>
    );
  }

  const effectiveMode: MemoryMode = hasConsent ? memoryMode : 'private';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { paddingHorizontal: spacing.base, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="취소">
            <Text style={[styles.headerAction, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
              취소
            </Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
            수정
          </Text>
          <Pressable
            onPress={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !content.trim()}
            accessibilityRole="button"
            accessibilityLabel="저장"
          >
            {saveMutation.isPending
              ? <ActivityIndicator size="small" color={colors.accent} />
              : (
                <Text style={[
                  styles.headerAction,
                  { fontFamily: typography.fontFamily.semiBold, color: content.trim() ? colors.accent : colors.border },
                ]}>
                  저장
                </Text>
              )}
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing.base, paddingTop: spacing.base }}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            ref={inputRef}
            style={[styles.editor, { color: colors.text, fontFamily: typography.fontFamily.regular }]}
            multiline
            value={content}
            onChangeText={setContent}
            textAlignVertical="top"
            autoFocus
          />

          {/* Mood picker */}
          <View style={[styles.section, { marginTop: spacing.lg }]}>
            <Text style={[styles.sectionLabel, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
              오늘 기분
            </Text>
            <View style={styles.moodRow}>
              {MOOD_EMOJIS.map((emoji, index) => {
                const val = index + 1;
                const selected = mood === val;
                return (
                  <Pressable
                    key={val}
                    onPress={() => setMood(selected ? null : val)}
                    style={[
                      styles.moodBtn,
                      { backgroundColor: selected ? colors.accentLight : 'transparent', borderRadius: radius.full },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text style={styles.moodEmoji}>{emoji}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Memory mode */}
          {hasConsent && (
            <View style={[styles.section, { marginTop: spacing.base }]}>
              <Text style={[styles.sectionLabel, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
                기록 방식
              </Text>
              {entry.memory_mode === 'remember' && effectiveMode !== 'remember' && (
                <Text style={[styles.modeWarning, { color: colors.error, fontFamily: typography.fontFamily.regular }]}>
                  기억 방식을 바꾸면 이 일기의 AI 기억이 삭제돼요.
                </Text>
              )}
              <View style={[styles.modeControl, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
                {MEMORY_MODES.map(({ mode, label }) => {
                  const active = effectiveMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => setMemoryMode(mode)}
                      style={[
                        styles.modeBtn,
                        { backgroundColor: active ? colors.accent : 'transparent', borderRadius: radius.md - 2 },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.modeBtnText, {
                        color: active ? '#fff' : colors.subtext,
                        fontFamily: typography.fontFamily.medium,
                      }]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.modeDesc, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
                {MEMORY_MODES.find((m) => m.mode === effectiveMode)?.desc}
              </Text>
            </View>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 15 },
  headerAction: { fontSize: 16, minWidth: 44, textAlign: 'center' },
  editor: { fontSize: 17, lineHeight: 28, minHeight: 200 },
  section: {},
  sectionLabel: { fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  moodRow: { flexDirection: 'row', gap: 8 },
  moodBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  moodEmoji: { fontSize: 26 },
  modeWarning: { fontSize: 13, marginBottom: 8 },
  modeControl: { flexDirection: 'row', padding: 3, gap: 2 },
  modeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  modeBtnText: { fontSize: 12 },
  modeDesc: { fontSize: 12, marginTop: 6 },
});
