import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { useAppleSignIn } from '@/hooks/useAppleSignIn';
import { APPLE_AUTH_MOCK } from '@/lib/appleAuth';

interface SavePromptProps {
  visible: boolean;
  onDismiss: () => void;
}

export function SavePrompt({ visible, onDismiss }: SavePromptProps) {
  const { colors, typography, spacing, radius } = useTheme();
  const { isLoading, trigger } = useAppleSignIn(onDismiss);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.xl,
              padding: spacing.xl,
            },
          ]}
          onPress={() => {}}
        >
          <Text style={[styles.title, { color: colors.text, fontFamily: typography.fontFamily.bold }]}>
            이 기록을 잃지 않으려면
          </Text>
          <Text style={[styles.body, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            지금은 임시 계정으로 저장되고 있어요.
            Apple 계정을 연결하면 기기를 바꿔도 일기와 AI 기억이 유지돼요.
          </Text>

          <Pressable
            onPress={trigger}
            disabled={isLoading}
            style={[
              styles.appleBtn,
              { backgroundColor: colors.black, borderRadius: radius.md },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Apple로 계정 연결"
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.appleBtnText, { fontFamily: typography.fontFamily.semiBold }]}>
                {APPLE_AUTH_MOCK ? '계정 연결하기 (개발 모드)' : ' Apple로 계속하기'}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={onDismiss}
            style={{ marginTop: spacing.sm, alignItems: 'center', padding: spacing.sm }}
            accessibilityRole="button"
            accessibilityLabel="나중에"
          >
            <Text style={[styles.skipText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
              나중에
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    margin: 12,
    marginBottom: 32,
  },
  title: { fontSize: 20, marginBottom: 10 },
  body: { fontSize: 15, lineHeight: 23, marginBottom: 24 },
  appleBtn: { padding: 16, alignItems: 'center' },
  appleBtnText: { color: '#fff', fontSize: 17 },
  skipText: { fontSize: 15 },
});
