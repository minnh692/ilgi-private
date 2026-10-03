import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useDraftStore } from '@/stores/draftStore';
import type { MemoryMode } from '@/types/database';
import { queryClient } from '@/lib/queryClient';

const DRAFT_KEY = 'diary_draft';

const PROMPT_CHIPS = [
  '오늘 가장 기억에 남는 순간은?',
  '오늘 어떤 감정이 가장 강했나요?',
  '오늘 나에게 고마운 것은?',
  '오늘 아쉬웠던 점은?',
];

const MEMORY_MODES: { mode: MemoryMode; label: string; desc: string }[] = [
  { mode: 'remember', label: '기억하고 답장', desc: 'AI가 답장을 쓰고 내용을 기억해요' },
  { mode: 'reply_only', label: '답장만', desc: 'AI가 답장을 쓰지만 기억하지 않아요' },
  { mode: 'private', label: '나만 보기', desc: 'AI에게 전송하지 않아요' },
];

const MOOD_EMOJIS = ['😔', '😕', '😊', '🙂', '😄'];

export default function WriteScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const { content, mood, memoryMode, promptUsed, setContent, setMood, setMemoryMode, setPromptUsed, clear } = useDraftStore();

  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const hasConsent = !!profile?.consent_ai_at;

  // Load persisted draft
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then((saved) => {
      if (saved && !content) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.content) setContent(parsed.content);
          if (parsed.mood) setMood(parsed.mood);
        } catch {}
      }
    });
  }, []);

  // Autosave draft
  useEffect(() => {
    const timer = setTimeout(() => {
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ content, mood }));
    }, 500);
    return () => clearTimeout(timer);
  }, [content, mood]);

  function handleChip(chip: string) {
    setContent(chip + '\n');
    setPromptUsed(chip);
    inputRef.current?.focus();
  }

  async function handleSave() {
    if (!content.trim()) {
      Alert.alert('일기를 써 주세요', '내용을 입력하고 저장해 주세요.');
      return;
    }
    if (!user) return;

    setIsSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: entry, error } = await supabase
        .from('entries')
        .insert({
          user_id: user.id,
          entry_date: today,
          content: content.trim(),
          mood,
          memory_mode: hasConsent ? memoryMode : 'private',
          prompt_used: promptUsed,
          safety_flag: false,
        })
        .select()
        .single();

      if (error) throw error;

      await AsyncStorage.removeItem(DRAFT_KEY);
      clear();

      await queryClient.invalidateQueries({ queryKey: ['entries', user.id] });
      router.replace(`/entry/${entry.id}`);
    } catch (e) {
      Alert.alert('저장 오류', '다시 시도해 주세요.');
    } finally {
      setIsSaving(false);
    }
  }

  const effectiveMode: MemoryMode = hasConsent ? memoryMode : 'private';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={[styles.header, { paddingHorizontal: spacing.base, borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="닫기"
          >
            <Text style={[styles.headerAction, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
              취소
            </Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
            {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={isSaving || !content.trim()}
            accessibilityRole="button"
            accessibilityLabel="저장"
          >
            <Text style={[
              styles.headerAction,
              {
                fontFamily: typography.fontFamily.semiBold,
                color: content.trim() ? colors.accent : colors.border,
              },
            ]}>
              저장
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing.base, paddingTop: spacing.base }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Prompt chips */}
          {!content && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
              {PROMPT_CHIPS.map((chip) => (
                <Pressable
                  key={chip}
                  onPress={() => handleChip(chip)}
                  style={[styles.chip, { backgroundColor: colors.accentLight, borderRadius: radius.full }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, { color: colors.accent, fontFamily: typography.fontFamily.medium }]}>
                    {chip}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Main editor */}
          <TextInput
            ref={inputRef}
            style={[
              styles.editor,
              {
                color: colors.text,
                fontFamily: typography.fontFamily.regular,
                minHeight: 200,
              },
            ]}
            multiline
            placeholder="오늘 있었던 일을 자유롭게 써 보세요..."
            placeholderTextColor={colors.placeholder}
            value={content}
            onChangeText={setContent}
            autoFocus={false}
            textAlignVertical="top"
          />

          {/* Mood picker */}
          <View style={[styles.section, { marginTop: spacing.lg }]}>
            <Text style={[styles.sectionLabel, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
              오늘 기분
            </Text>
            <View style={styles.moodRow}>
              {MOOD_EMOJIS.map((emoji, index) => {
                const moodVal = index + 1;
                const selected = mood === moodVal;
                return (
                  <Pressable
                    key={moodVal}
                    onPress={() => setMood(selected ? null : moodVal)}
                    style={[
                      styles.moodBtn,
                      {
                        backgroundColor: selected ? colors.accentLight : 'transparent',
                        borderRadius: radius.full,
                      },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`기분 ${moodVal}`}
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
              <View style={[styles.modeControl, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
                {MEMORY_MODES.map(({ mode, label }) => {
                  const active = effectiveMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => setMemoryMode(mode)}
                      style={[
                        styles.modeBtn,
                        {
                          backgroundColor: active ? colors.accent : 'transparent',
                          borderRadius: radius.md - 2,
                        },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[
                        styles.modeBtnText,
                        {
                          color: active ? '#fff' : colors.subtext,
                          fontFamily: typography.fontFamily.medium,
                        },
                      ]}>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 15 },
  headerAction: { fontSize: 16, minWidth: 44, textAlign: 'center' },
  chips: { marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, marginRight: 8 },
  chipText: { fontSize: 14 },
  editor: { fontSize: 17, lineHeight: 28 },
  section: {},
  sectionLabel: { fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  moodRow: { flexDirection: 'row', gap: 8 },
  moodBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  moodEmoji: { fontSize: 26 },
  modeControl: { flexDirection: 'row', padding: 3, gap: 2 },
  modeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  modeBtnText: { fontSize: 12 },
  modeDesc: { fontSize: 12, marginTop: 6 },
});
