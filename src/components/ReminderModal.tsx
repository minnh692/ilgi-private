import { View, Text, StyleSheet, Pressable, Modal, Alert } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { scheduleReminder, cancelReminder } from '@/lib/notifications';

const PRESETS = [
  { label: '오전 9시', hour: 9, minute: 0 },
  { label: '오후 12시', hour: 12, minute: 0 },
  { label: '오후 6시', hour: 18, minute: 0 },
  { label: '오후 8시', hour: 20, minute: 0 },
  { label: '오후 9시', hour: 21, minute: 0 },
  { label: '오후 10시', hour: 22, minute: 0 },
];

interface Props {
  visible: boolean;
  currentTime: string | null;
  onDismiss: () => void;
  onSaved: (time: string | null) => void;
}

function presetToTimeString(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function ReminderModal({ visible, currentTime, onDismiss, onSaved }: Props) {
  const { colors, typography, spacing, radius } = useTheme();

  async function handleSelect(hour: number, minute: number) {
    try {
      await scheduleReminder(hour, minute);
      onSaved(presetToTimeString(hour, minute));
      onDismiss();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'permission_denied') {
        Alert.alert('알림 권한 없음', '설정에서 알림을 허용해 주세요.');
      } else {
        Alert.alert('오류', '알림 설정 중 문제가 생겼어요. 다시 시도해 주세요.');
      }
    }
  }

  async function handleOff() {
    await cancelReminder();
    onSaved(null);
    onDismiss();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <Text style={[styles.title, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
          매일 알림 시간
        </Text>
        {PRESETS.map((p) => {
          const timeStr = presetToTimeString(p.hour, p.minute);
          const isActive = currentTime === timeStr;
          return (
            <Pressable
              key={timeStr}
              onPress={() => handleSelect(p.hour, p.minute)}
              style={[
                styles.option,
                {
                  backgroundColor: isActive ? colors.accentLight : 'transparent',
                  borderRadius: radius.md,
                  paddingVertical: spacing.base,
                  paddingHorizontal: spacing.base,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={p.label}
            >
              <Text style={[styles.optionText, { color: isActive ? colors.accent : colors.text, fontFamily: isActive ? typography.fontFamily.semiBold : typography.fontFamily.regular }]}>
                {p.label}
              </Text>
              {isActive && <Text style={{ color: colors.accent, fontSize: 16 }}>✓</Text>}
            </Pressable>
          );
        })}
        <Pressable
          onPress={handleOff}
          style={[styles.option, { borderRadius: radius.md, paddingVertical: spacing.base, paddingHorizontal: spacing.base }]}
          accessibilityRole="button"
          accessibilityLabel="알림 끄기"
        >
          <Text style={[styles.optionText, { color: colors.error, fontFamily: typography.fontFamily.regular }]}>
            알림 끄기
          </Text>
        </Pressable>
        <Pressable onPress={onDismiss} style={[styles.cancelBtn, { paddingVertical: spacing.base }]} accessibilityRole="button">
          <Text style={[styles.cancelText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            취소
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { paddingHorizontal: 20, paddingBottom: 36 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 18 },
  title: { fontSize: 17, marginBottom: 8, textAlign: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionText: { fontSize: 16 },
  cancelBtn: { alignItems: 'center', marginTop: 8 },
  cancelText: { fontSize: 15 },
});
