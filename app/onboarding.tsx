import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export default function OnboardingScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [consentSensitive, setConsentSensitive] = useState(false);
  const [consentAi, setConsentAi] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allConsented = consentSensitive && consentAi;

  async function handleAgree() {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          plan: 'free',
          default_memory_mode: 'remember',
          consent_ai_at: now,
          consent_sensitive_at: now,
          consent_overseas_at: now,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          onboarding_state: { completed: false },
        })
        .select()
        .single();

      if (error) throw error;
      setProfile(data);
      router.replace('/(tabs)/diary');
    } catch (e) {
      Alert.alert('오류', '다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePrivateOnly() {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          plan: 'free',
          default_memory_mode: 'private',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          onboarding_state: { completed: false, privacyOnly: true },
        })
        .select()
        .single();

      if (error) throw error;
      setProfile(data);
      router.replace('/(tabs)/diary');
    } catch (e) {
      Alert.alert('오류', '다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: spacing.xl, paddingBottom: 48 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <Text style={[styles.appName, { color: colors.accent, fontFamily: typography.fontFamily.bold }]}>
            일기
          </Text>
          <Text style={[styles.tagline, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
            AI가 읽고, 기억하고,{'\n'}답장을 써요.
          </Text>
          <Text style={[styles.description, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            오늘 있었던 일을 쓰면 AI가 따뜻한 답장을 드려요.
            일기를 쓸수록 AI가 나를 더 잘 알아가고, 감정과 습관의 패턴을 발견해 드려요.
          </Text>
          <Text style={[styles.disclosure, { color: colors.subtext, fontFamily: typography.fontFamily.regular, borderColor: colors.border }]}>
            답장은 AI가 써요. 의료 서비스가 아니에요.
          </Text>
        </View>

        <View style={styles.consentsSection}>
          <Text style={[styles.consentHeader, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
            이용 동의
          </Text>

          <ConsentRow
            value={consentSensitive}
            onChange={setConsentSensitive}
            label="민감정보(감정·심리 관련 내용) 처리에 동의해요"
            colors={colors}
            typography={typography}
            spacing={spacing}
          />

          <ConsentRow
            value={consentAi}
            onChange={setConsentAi}
            label="일기 내용을 AI 답장 생성을 위해 Anthropic(미국)에 전송하는 것에 동의해요"
            colors={colors}
            typography={typography}
            spacing={spacing}
          />
        </View>

        <Pressable
          onPress={handleAgree}
          disabled={!allConsented || isSubmitting}
          style={[
            styles.primaryButton,
            {
              backgroundColor: allConsented ? colors.accent : colors.border,
              borderRadius: radius.lg,
              marginTop: spacing.xl,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="동의하고 시작하기"
        >
          <Text style={[styles.primaryButtonText, { fontFamily: typography.fontFamily.semiBold }]}>
            동의하고 시작하기
          </Text>
        </Pressable>

        <Pressable
          onPress={handlePrivateOnly}
          disabled={isSubmitting}
          style={{ marginTop: spacing.base, alignItems: 'center', padding: spacing.sm }}
          accessibilityRole="button"
          accessibilityLabel="동의하지 않고 시작"
        >
          <Text style={[styles.secondaryButtonText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            동의하지 않고 시작 (AI 답장 없음)
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function ConsentRow({
  value,
  onChange,
  label,
  colors,
  typography,
  spacing,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  colors: ReturnType<typeof useTheme>['colors'];
  typography: ReturnType<typeof useTheme>['typography'];
  spacing: ReturnType<typeof useTheme>['spacing'];
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={[styles.consentRow, { paddingVertical: spacing.sm }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <View style={[styles.checkbox, { borderColor: value ? colors.accent : colors.border, backgroundColor: value ? colors.accent : 'transparent' }]}>
        {value && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <Text style={[styles.consentLabel, { color: colors.text, fontFamily: typography.fontFamily.regular, flex: 1 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 48 },
  heroSection: { marginBottom: 40 },
  appName: { fontSize: 42, marginBottom: 12 },
  tagline: { fontSize: 26, lineHeight: 36, marginBottom: 16 },
  description: { fontSize: 16, lineHeight: 26, marginBottom: 16 },
  disclosure: {
    fontSize: 13,
    lineHeight: 20,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  consentsSection: { marginBottom: 8 },
  consentHeader: { fontSize: 17, marginBottom: 12 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  consentLabel: { fontSize: 15, lineHeight: 22 },
  primaryButton: { padding: 16, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 17 },
  secondaryButtonText: { fontSize: 14 },
});
