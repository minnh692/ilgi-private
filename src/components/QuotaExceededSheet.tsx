import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme/useTheme';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  plan: 'free' | 'plus';
}

export function QuotaExceededSheet({ visible, onDismiss, plan }: Props) {
  const { colors, typography, spacing, radius } = useTheme();

  function handleUpgrade() {
    onDismiss();
    router.push('/paywall');
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <Text style={[styles.title, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
          {plan === 'free' ? '이번 주 답장 횟수를 다 썼어요' : '오늘 답장 횟수를 다 썼어요'}
        </Text>
        <Text style={[styles.body, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
          {plan === 'free'
            ? '무료 플랜은 7일에 3번 답장을 받을 수 있어요.\n플러스로 업그레이드하면 매일 10번 받을 수 있어요.'
            : '내일 다시 답장을 받을 수 있어요.'}
        </Text>

        {plan === 'free' && (
          <Pressable
            onPress={handleUpgrade}
            style={[styles.upgradeBtn, { backgroundColor: colors.accent, borderRadius: radius.md }]}
            accessibilityRole="button"
            accessibilityLabel="플러스로 업그레이드"
          >
            <Text style={[styles.upgradeBtnText, { fontFamily: typography.fontFamily.semiBold }]}>
              플러스로 업그레이드
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={onDismiss}
          style={[styles.dismissBtn, { borderRadius: radius.md }]}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        >
          <Text style={[styles.dismissBtnText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            {plan === 'free' ? '나중에' : '확인'}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 18, marginBottom: 10, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 23, textAlign: 'center', marginBottom: 24 },
  upgradeBtn: { paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  upgradeBtnText: { color: '#fff', fontSize: 16 },
  dismissBtn: { paddingVertical: 12, alignItems: 'center' },
  dismissBtnText: { fontSize: 15 },
});
