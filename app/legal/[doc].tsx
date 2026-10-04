import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { LEGAL_DOCS, type LegalDocId } from '@/content/legal';

export default function LegalDocScreen() {
  const { colors, typography, spacing } = useTheme();
  const { doc: docId } = useLocalSearchParams<{ doc: string }>();
  const doc = LEGAL_DOCS[docId as LegalDocId];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { paddingHorizontal: spacing.base, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="닫기" hitSlop={8}>
          <Text style={[styles.backBtn, { color: colors.accent, fontFamily: typography.fontFamily.medium }]}>
            닫기
          </Text>
        </Pressable>
        <Text
          style={[styles.headerTitle, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}
          numberOfLines={1}
        >
          {doc?.title ?? '문서'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {doc ? (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 48 }}>
          <Text style={[styles.updatedAt, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            시행일: {doc.updatedAt}
          </Text>
          {doc.intro && (
            <Text style={[styles.body, { color: colors.text, fontFamily: typography.fontFamily.regular, marginBottom: spacing.lg }]}>
              {doc.intro}
            </Text>
          )}
          {doc.sections.map((s) => (
            <View key={s.heading} style={{ marginBottom: spacing.lg }}>
              <Text style={[styles.heading, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
                {s.heading}
              </Text>
              <Text style={[styles.body, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
                {s.body}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={[styles.body, { color: colors.subtext, padding: spacing.xl }]}>문서를 찾을 수 없어요.</Text>
      )}
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
  headerTitle: { fontSize: 17, flexShrink: 1 },
  backBtn: { fontSize: 16, minWidth: 60 },
  updatedAt: { fontSize: 13, marginBottom: 16 },
  heading: { fontSize: 16, marginBottom: 6 },
  body: { fontSize: 15, lineHeight: 24 },
});
