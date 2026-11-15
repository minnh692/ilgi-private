import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { toTimeString } from '@/lib/notifications';

const PRESETS = [
  { label: '오전 9시', hour: 9, minute: 0 },
  { label: '오후 12시', hour: 12, minute: 0 },
  { label: '오후 6시', hour: 18, minute: 0 },
  { label: '오후 8시', hour: 20, minute: 0 },
  { label: '오후 9시', hour: 21, minute: 0 },
  { label: '오후 10시', hour: 22, minute: 0 },
];

export type ReminderChoice =
  | { mode: 'fixed'; hour: number; minute: number }
  | { mode: 'auto' }
  | { mode: 'off' };

interface Props {
  visible: boolean;
  /** 'auto', a fixed "HH:MM", or null when the reminder is off */
  selected: string | null;
  /** The auto option needs marketing consent, so it's only offered to users who gave it */
  showAuto: boolean;
  onDismiss: () => void;
  /** The parent schedules the notification and saves the choice */
  onSelect: (choice: ReminderChoice) => void;
}

export function ReminderModal({ visible, selected, showAuto, onDismiss, onSelect }: Props) {
  const { colors, typography, spacing, radius } = useTheme();

  function renderOption(key: string, label: string, isActive: boolean, choice: ReminderChoice, desc?: string) {
    return (
      <Pressable
        key={key}
        onPress={() => onSelect(choice)}
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
        accessibilityLabel={label}
        accessibilityState={{ selected: isActive }}
      >
        <View style={styles.optionTextWrap}>
          <Text style={[styles.optionText, { color: isActive ? colors.accent : colors.text, fontFamily: isActive ? typography.fontFamily.semiBold : typography.fontFamily.regular }]}>
            {label}
          </Text>
          {desc && (
            <Text style={[styles.optionDesc, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
              {desc}
            </Text>
          )}
        </View>
        {isActive && <Text style={{ color: colors.accent, fontSize: 16 }}>✓</Text>}
      </Pressable>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <Text style={[styles.title, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
          매일 알림 시간
        </Text>
        {showAuto &&
          renderOption('auto', '맞춤 시간', selected === 'auto', { mode: 'auto' }, '일기를 자주 쓰는 시간에 맞춰요')}
        {PRESETS.map((p) => {
          const time = toTimeString(p);
          return renderOption(time, p.label, selected === time, { mode: 'fixed', hour: p.hour, minute: p.minute });
        })}
        <Pressable
          onPress={() => onSelect({ mode: 'off' })}
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
  optionTextWrap: { flex: 1 },
  optionText: { fontSize: 16 },
  optionDesc: { fontSize: 13, marginTop: 2 },
  cancelBtn: { alignItems: 'center', marginTop: 8 },
  cancelText: { fontSize: 15 },
});
