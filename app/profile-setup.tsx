import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, Pressable, Alert, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import Pencil from '../assets/brand/svg/muni-pencil.svg';

const NICKNAME_MAX = 20;
const MIN_BIRTH_DATE = new Date(1900, 0, 1);
const DEFAULT_PICKER_DATE = new Date(2000, 0, 1);

// Local Y-M-D (toISOString would shift the day across the UTC boundary)
function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatKoreanDate(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

/**
 * Nickname + birthday. Shown once after consent in onboarding, and reused from
 * settings with `?mode=edit`.
 */
export default function ProfileSetupScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isEdit = mode === 'edit';
  const { colors, typography, spacing, radius, dark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [birthDate, setBirthDate] = useState<string | null>(profile?.birth_date ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const trimmed = nickname.trim();

  function leave() {
    if (isEdit) router.back();
    else router.replace('/(tabs)/diary');
  }

  function handleDateChange(event: DateTimePickerEvent, date?: Date) {
    // Android shows a dialog that closes itself; iOS spinner stays inline until toggled
    if (Platform.OS === 'android') setPickerOpen(false);
    if (event.type === 'set' && date) setBirthDate(toDateString(date));
  }

  async function handleSave() {
    if (!user) return;
    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ nickname: trimmed || null, birth_date: birthDate })
        .eq('id', user.id)
        .select()
        .single();
      if (error) throw error;
      setProfile(data);
      leave();
    } catch (e) {
      console.error('[profile-setup] save failed', { code: (e as { code?: string })?.code });
      Alert.alert('오류', '저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: 48, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <Pencil width={72} height={72} style={{ marginBottom: spacing.lg }} accessibilityElementsHidden importantForAccessibility="no" />
          <Text style={[styles.title, { color: colors.text, fontFamily: typography.fontFamily.bold }]}>
            무늬가 어떻게{'\n'}불러드릴까요?
          </Text>
          <Text style={[styles.subtitle, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            답장에서 닉네임으로 불러드리고, 생일에는 축하 인사도 함께 써드려요.
          </Text>

          {/* Nickname */}
          <Text style={[styles.label, { color: colors.subtext, fontFamily: typography.fontFamily.medium, marginTop: spacing['2xl'] }]}>
            닉네임
          </Text>
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            placeholder="예: 민지"
            placeholderTextColor={colors.placeholder}
            maxLength={NICKNAME_MAX}
            autoCorrect={false}
            returnKeyType="done"
            style={[styles.input, {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.md,
              fontFamily: typography.fontFamily.regular,
            }]}
            accessibilityLabel="닉네임"
          />
          {trimmed ? (
            <Text style={[styles.hint, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
              답장에서 &quot;{trimmed}님&quot;이라고 불러드려요.
            </Text>
          ) : null}

          {/* Birthday */}
          <Text style={[styles.label, { color: colors.subtext, fontFamily: typography.fontFamily.medium, marginTop: spacing.xl }]}>
            생일 (선택)
          </Text>
          <View style={styles.dateRow}>
            <Pressable
              onPress={() => setPickerOpen((v) => !v)}
              style={[styles.input, styles.dateButton, {
                backgroundColor: colors.surface,
                borderColor: pickerOpen ? colors.accent : colors.border,
                borderRadius: radius.md,
              }]}
              accessibilityRole="button"
              accessibilityLabel={birthDate ? `생일 ${formatKoreanDate(birthDate)}, 변경` : '생일 선택'}
            >
              <Text style={{ color: birthDate ? colors.text : colors.placeholder, fontFamily: typography.fontFamily.regular, fontSize: 16 }}>
                {birthDate ? formatKoreanDate(birthDate) : '생일 선택'}
              </Text>
            </Pressable>
            {birthDate && (
              <Pressable
                onPress={() => { setBirthDate(null); setPickerOpen(false); }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="생일 지우기"
              >
                <Text style={{ color: colors.subtext, fontFamily: typography.fontFamily.regular, fontSize: 14 }}>
                  지우기
                </Text>
              </Pressable>
            )}
          </View>
          {pickerOpen && (
            <DateTimePicker
              value={birthDate ? fromDateString(birthDate) : DEFAULT_PICKER_DATE}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              locale="ko-KR"
              themeVariant={dark ? 'dark' : 'light'}
              minimumDate={MIN_BIRTH_DATE}
              maximumDate={new Date()}
              onChange={handleDateChange}
            />
          )}
          <Text style={[styles.hint, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            생년월일은 AI에게 보내지 않아요. 오늘이 생일인지만 알려줘요.
          </Text>

          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={[styles.primaryButton, { backgroundColor: colors.accent, borderRadius: radius.lg, marginTop: spacing['2xl'] }]}
            accessibilityRole="button"
            accessibilityLabel={isEdit ? '저장' : '시작하기'}
          >
            <Text style={[styles.primaryButtonText, { fontFamily: typography.fontFamily.semiBold }]}>
              {isEdit ? '저장' : '시작하기'}
            </Text>
          </Pressable>

          <Pressable
            onPress={leave}
            disabled={isSaving}
            style={{ marginTop: spacing.base, alignItems: 'center', padding: spacing.sm }}
            accessibilityRole="button"
            accessibilityLabel={isEdit ? '취소' : '나중에 할게요'}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
              {isEdit ? '취소' : '나중에 할게요'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 26, lineHeight: 36, marginBottom: 12 },
  subtitle: { fontSize: 15, lineHeight: 23 },
  label: { fontSize: 13, marginBottom: 8 },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  hint: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateButton: { flex: 1 },
  primaryButton: { padding: 16, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 17 },
  secondaryButtonText: { fontSize: 14 },
});
