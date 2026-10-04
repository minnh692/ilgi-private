import { useState } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useTheme } from '@/theme/useTheme';

interface Props {
  visible: boolean;
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

export function EditMemoryModal({ visible, initialContent, onSave, onCancel }: Props) {
  const { colors, typography, spacing, radius } = useTheme();
  const [text, setText] = useState(initialContent);

  // Reset the text each time the modal opens
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setText(initialContent);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={[styles.box, {
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          padding: spacing.xl,
          margin: spacing.xl,
        }]}>
          <Text style={[styles.title, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
            기억 수정
          </Text>
          <TextInput
            style={[styles.input, {
              color: colors.text,
              fontFamily: typography.fontFamily.regular,
              borderColor: colors.border,
              borderRadius: radius.md,
              backgroundColor: colors.background,
            }]}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            textAlignVertical="top"
          />
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={[styles.btn, { borderColor: colors.border, borderRadius: radius.md }]}>
              <Text style={[styles.btnText, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
                취소
              </Text>
            </Pressable>
            <Pressable
              onPress={() => text.trim() && onSave(text.trim())}
              style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.accent, borderRadius: radius.md }]}
              disabled={!text.trim()}
            >
              <Text style={[styles.btnText, { color: '#fff', fontFamily: typography.fontFamily.medium }]}>
                저장
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  box: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  title: { fontSize: 16, marginBottom: 14 },
  input: { fontSize: 15, lineHeight: 22, borderWidth: 1, padding: 12, minHeight: 80, marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  btnPrimary: { borderWidth: 0 },
  btnText: { fontSize: 15 },
});
