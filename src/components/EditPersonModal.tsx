import { useState } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useTheme } from '@/theme/useTheme';
import type { Database } from '@/types/database';

type Person = Database['public']['Tables']['people']['Row'];

interface Props {
  visible: boolean;
  person: Person | null;
  onSave: (data: { display_name: string; relation: string; notes: string; aliases: string[] }) => void;
  onCancel: () => void;
}

export function EditPersonModal({ visible, person, onSave, onCancel }: Props) {
  const { colors, typography, spacing, radius } = useTheme();
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [notes, setNotes] = useState('');
  const [aliasesText, setAliasesText] = useState('');

  // Load the person's fields each time the modal opens (or the target person changes)
  const target = visible ? person : null;
  const [loadedFor, setLoadedFor] = useState<Person | null>(null);
  if (target !== loadedFor) {
    setLoadedFor(target);
    if (target) {
      setName(target.display_name);
      setRelation(target.relation ?? '');
      setNotes(target.notes ?? '');
      setAliasesText((target.aliases as string[])?.join(', ') ?? '');
    }
  }

  function handleSave() {
    if (!name.trim()) return;
    const aliases = aliasesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    onSave({ display_name: name.trim(), relation: relation.trim(), notes: notes.trim(), aliases });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={[styles.sheet, {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          padding: spacing.xl,
          paddingBottom: 40,
        }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
            사람 수정
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {([
              { label: '이름', value: name, onChange: setName, placeholder: '이름 또는 호칭' },
              { label: '관계', value: relation, onChange: setRelation, placeholder: '예: 직장 동료, 친구, 가족' },
              { label: '별칭 (쉼표로 구분)', value: aliasesText, onChange: setAliasesText, placeholder: '예: 팀장님, 과장님' },
              { label: '메모', value: notes, onChange: setNotes, placeholder: 'AI가 이 사람을 기억할 때 참고할 메모' },
            ] as const).map(({ label, value, onChange, placeholder }) => (
              <View key={label} style={{ marginBottom: spacing.base }}>
                <Text style={[styles.label, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
                  {label}
                </Text>
                <TextInput
                  style={[styles.input, {
                    color: colors.text,
                    fontFamily: typography.fontFamily.regular,
                    borderColor: colors.border,
                    borderRadius: radius.md,
                    backgroundColor: colors.background,
                  }]}
                  value={value}
                  onChangeText={onChange as (v: string) => void}
                  placeholder={placeholder}
                  placeholderTextColor={colors.placeholder}
                  multiline={label === '메모'}
                  textAlignVertical={label === '메모' ? 'top' : 'center'}
                />
              </View>
            ))}
          </ScrollView>
          <View style={[styles.actions, { marginTop: spacing.base }]}>
            <Pressable onPress={onCancel} style={[styles.btn, { borderColor: colors.border, borderRadius: radius.md }]}>
              <Text style={[styles.btnText, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
                취소
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={[styles.btn, { backgroundColor: colors.accent, borderRadius: radius.md }]}
              disabled={!name.trim()}
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
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {},
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 17, marginBottom: 20 },
  label: { fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { fontSize: 15, borderWidth: 1, padding: 10, minHeight: 40 },
  actions: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  btnText: { fontSize: 15 },
});
