import { useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { FREE_LAUNCH, hasPlusFeatures } from '@/lib/plan';
import type { Database } from '@/types/database';
import Constants from 'expo-constants';
import { MoodFace, MOOD_VALUES } from '@/components/MoodFace';
import FeaturePattern from '../../assets/brand/svg/muni-feature-pattern.svg';
import ModePrivate from '../../assets/brand/svg/muni-mode-private.svg';
import Paw from '../../assets/brand/svg/muni-paw.svg';

type ReportRow = Database['public']['Tables']['reports']['Row'];
type MemoryItem = Database['public']['Tables']['memory_items']['Row'];

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl as string;
const MOOD_COLORS = ['#E07A5F', '#F4C842', '#7EC8A4', '#7EB5D4', '#C39BD3'] as const;

// ─── Period helpers ────────────────────────────────────────────────────────────

function getWeekPeriodStart(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

function getMonthPeriodStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
}

// ─── Mood trend chart ─────────────────────────────────────────────────────────

function MoodTrendChart({ moods }: { moods: Array<{ date: string; mood: number | null }> }) {
  const { colors, spacing } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - spacing.base * 2 - spacing.xl * 2;
  const barGap = 2;
  const barWidth = Math.max(2, Math.floor((chartWidth - (moods.length - 1) * barGap) / moods.length));
  const maxBarH = 44;

  if (moods.every((m) => m.mood === null)) {
    return (
      <Text style={[styles.chartEmpty, { color: colors.subtext }]}>
        기분을 기록하면 여기서 흐름을 볼 수 있어요.
      </Text>
    );
  }

  return (
    <View style={[styles.chartRow, { height: maxBarH + 4 }]}>
      {moods.map(({ date, mood }) => (
        <View
          key={date}
          style={{
            width: barWidth,
            height: mood ? Math.max(4, (mood / 5) * maxBarH) : 3,
            backgroundColor: mood ? MOOD_COLORS[mood - 1] : colors.border,
            borderRadius: barWidth,
            alignSelf: 'flex-end',
            marginRight: barGap,
          }}
        />
      ))}
    </View>
  );
}

// ─── Report card ──────────────────────────────────────────────────────────────

type WeeklyContent = {
  summary: string;
  emotional_arc?: string;
  themes?: string[];
  people?: string[];
  what_helped?: string[];
  suggestion?: string;
  plan: 'free' | 'plus';
  pattern_count?: number;
};

type MonthlyContent = WeeklyContent & { vs_previous?: string | null };

function ReportCard({
  label,
  report,
  isGenerating,
  onRetry,
}: {
  label: string;
  report: ReportRow | null | undefined;
  isGenerating: boolean;
  onRetry: () => void;
}) {
  const { colors, typography, spacing, radius, shadow } = useTheme();
  const content = report?.content as WeeklyContent | MonthlyContent | null;

  return (
    <View style={[styles.card, {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.base,
      marginBottom: spacing.sm,
      ...shadow.sm,
    }]}>
      <Text style={[styles.cardLabel, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
        {label}
      </Text>

      {isGenerating ? (
        <View style={styles.generatingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.generatingText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            리포트를 작성하고 있어요...
          </Text>
        </View>
      ) : !content ? (
        <Pressable onPress={onRetry}>
          <Text style={[styles.cardBody, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
            불러오지 못했어요. 탭해서 다시 시도해 주세요.
          </Text>
        </Pressable>
      ) : (
        <>
          <Text style={[styles.reportSummary, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
            {content.summary}
          </Text>

          {content.plan === 'free' && !FREE_LAUNCH && typeof content.pattern_count === 'number' && (
            <Pressable onPress={() => router.push('/paywall')} style={[styles.patternTeaser, { backgroundColor: colors.accentLight, borderRadius: radius.md }]}>
              <View style={styles.iconRow}>
                <FeaturePattern width={16} height={16} style={styles.rowIcon} />
                <Text style={[styles.patternTeaserText, styles.rowText, { color: colors.accent, fontFamily: typography.fontFamily.medium }]}>
                  패턴 {content.pattern_count}개 발견 — Plus에서 확인해 보세요
                </Text>
              </View>
            </Pressable>
          )}

          {content.plan === 'plus' && (
            <>
              {content.emotional_arc ? (
                <Text style={[styles.reportArc, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
                  {content.emotional_arc}
                </Text>
              ) : null}

              {content.themes?.length ? (
                <View style={styles.chipRow}>
                  {content.themes.map((t) => (
                    <Text key={t} style={[styles.themeChip, { backgroundColor: colors.surfaceAlt, color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
                      {t}
                    </Text>
                  ))}
                </View>
              ) : null}

              {content.what_helped?.length ? (
                <View style={styles.sectionBlock}>
                  <Text style={[styles.sectionMiniLabel, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
                    도움이 됐던 것
                  </Text>
                  {content.what_helped.map((h) => (
                    <Text key={h} style={[styles.bulletItem, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
                      • {h}
                    </Text>
                  ))}
                </View>
              ) : null}

              {content.suggestion ? (
                <View style={[styles.suggestionBox, { backgroundColor: colors.accentLight, borderRadius: radius.md }]}>
                  <View style={styles.iconRow}>
                    <Paw width={16} height={16} color={colors.accent} style={styles.rowIcon} />
                    <Text style={[styles.suggestionText, styles.rowText, { color: colors.accent, fontFamily: typography.fontFamily.regular }]}>
                      {content.suggestion}
                    </Text>
                  </View>
                </View>
              ) : null}

              {'vs_previous' in content && content.vs_previous ? (
                <Text style={[styles.vsPrevious, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
                  {content.vs_previous}
                </Text>
              ) : null}
            </>
          )}
        </>
      )}
    </View>
  );
}

// ─── Pattern section ──────────────────────────────────────────────────────────

function PatternSection({ items, isPlus }: { items: MemoryItem[]; isPlus: boolean }) {
  const { colors, typography, spacing, radius, shadow } = useTheme();

  if (!isPlus) {
    return (
      <Pressable
        onPress={() => router.push('/paywall')}
        style={[styles.card, {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing.base,
          ...shadow.sm,
        }]}
        accessibilityRole="button"
        accessibilityLabel="패턴 보기 — Plus 업그레이드"
      >
        <View style={styles.iconRow}>
          <ModePrivate width={16} height={16} color={colors.subtext} style={styles.rowIcon} />
          <Text style={[styles.lockedTitle, styles.rowText, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
            패턴 {items.length > 0 ? `${items.length}개 발견` : '카드'}
          </Text>
        </View>
        <Text style={[styles.lockedHint, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
          Plus로 업그레이드하면 AI가 발견한 패턴을 자세히 볼 수 있어요.
        </Text>
      </Pressable>
    );
  }

  if (items.length === 0) {
    return (
      <Text style={[styles.noPatterns, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
        일기를 더 쓰면 패턴이 발견돼요.
      </Text>
    );
  }

  return (
    <>
      {items.map((item) => (
        <View key={item.id} style={[styles.patternCard, {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing.base,
          marginBottom: spacing.sm,
          borderLeftWidth: 3,
          borderLeftColor: colors.accent,
          ...shadow.sm,
        }]}>
          <Text style={[styles.patternCategory, { color: colors.accent, fontFamily: typography.fontFamily.medium }]}>
            {CATEGORY_LABELS[item.category] ?? item.category}
          </Text>
          <Text style={[styles.patternContent, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
            {item.content}
          </Text>
        </View>
      ))}
    </>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  theme: '자주 등장하는 주제',
  person_pattern: '중요한 사람들',
  value_goal: '가치·목표',
  what_helps: '도움이 됐던 것',
  trigger: '힘들어지는 상황',
  preference: '취향·선호',
};

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function InsightsTab() {
  const { colors, typography, spacing } = useTheme();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isPlus = hasPlusFeatures(profile?.plan);
  const qc = useQueryClient();

  const weekStart = useMemo(() => getWeekPeriodStart(), []);
  const monthStart = useMemo(() => getMonthPeriodStart(), []);

  // Tabs stay mounted, so refresh whenever the user comes back here after writing
  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ['report'] });
      qc.invalidateQueries({ queryKey: ['mood_trend'] });
      qc.invalidateQueries({ queryKey: ['memory_items_insights'] });
    }, [qc]),
  );

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: weeklyReport, isSuccess: weeklyLoaded } = useQuery({
    queryKey: ['report', 'weekly', weekStart, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('reports').select('*')
        .eq('user_id', user!.id).eq('kind', 'weekly')
        .eq('period_start', weekStart).maybeSingle();
      return (data as ReportRow | null) ?? null;
    },
    enabled: !!user,
  });

  const { data: monthlyReport, isSuccess: monthlyLoaded } = useQuery({
    queryKey: ['report', 'monthly', monthStart, user?.id],
    queryFn: async () => {
      if (!isPlus) return null;
      const { data } = await supabase
        .from('reports').select('*')
        .eq('user_id', user!.id).eq('kind', 'monthly')
        .eq('period_start', monthStart).maybeSingle();
      return (data as ReportRow | null) ?? null;
    },
    enabled: !!user,
  });

  const { data: moodEntries = [] } = useQuery({
    queryKey: ['mood_trend', user?.id],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
      const { data } = await supabase
        .from('entries')
        .select('entry_date, mood')
        .eq('user_id', user!.id)
        .gte('entry_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('entry_date', { ascending: true });
      return (data ?? []) as Array<{ entry_date: string; mood: number | null }>;
    },
    enabled: !!user,
  });

  const { data: memoryItems = [] } = useQuery({
    queryKey: ['memory_items_insights', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('memory_items')
        .select('*')
        .eq('user_id', user!.id)
        .in('status', ['active', 'user_edited'])
        .order('confidence', { ascending: false })
        .limit(isPlus ? 10 : 1); // Free: just need count; Plus: show items
      return (data ?? []) as MemoryItem[];
    },
    enabled: !!user,
  });

  // ── Report mutations ───────────────────────────────────────────────────────

  async function callGenerateReport(kind: 'weekly' | 'monthly') {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ kind }),
    });
    if (!res.ok) throw new Error('Generation failed');
    return res.json() as Promise<{ report: ReportRow }>;
  }

  const generateWeekly = useMutation({
    mutationFn: () => callGenerateReport('weekly'),
    onSuccess: (res) => qc.setQueryData(['report', 'weekly', weekStart, user?.id], res.report),
  });

  const generateMonthly = useMutation({
    mutationFn: () => callGenerateReport('monthly'),
    onSuccess: (res) => qc.setQueryData(['report', 'monthly', monthStart, user?.id], res.report),
  });

  // ── Auto-generate when no cached report ───────────────────────────────────

  useEffect(() => {
    if (weeklyLoaded && weeklyReport === null && !generateWeekly.isPending) {
      generateWeekly.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeklyLoaded, weeklyReport]);

  useEffect(() => {
    if (!isPlus) return;
    if (monthlyLoaded && monthlyReport === null && !generateMonthly.isPending) {
      generateMonthly.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyLoaded, monthlyReport, isPlus]);

  // ── Mood data ──────────────────────────────────────────────────────────────

  const moodData = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of moodEntries) {
      if (e.mood !== null && !map.has(e.entry_date)) {
        map.set(e.entry_date, e.mood);
      }
    }
    const days: Array<{ date: string; mood: number | null }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toISOString().split('T')[0];
      days.push({ date, mood: map.get(date) ?? null });
    }
    return days;
  }, [moodEntries]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {/* Header */}
        <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
          <Text style={[styles.headerTitle, { color: colors.text, fontFamily: typography.fontFamily.bold }]}>
            인사이트
          </Text>
          {!isPlus && (
            <Link href="/paywall" asChild>
              <Pressable
                style={StyleSheet.flatten([styles.plusChip, { backgroundColor: colors.accent }])}
                accessibilityRole="button"
                accessibilityLabel="Plus로 업그레이드"
              >
                <Text style={[styles.plusText, { fontFamily: typography.fontFamily.medium }]}>Plus</Text>
              </Pressable>
            </Link>
          )}
        </View>

        <View style={{ paddingHorizontal: spacing.base, marginTop: spacing.sm }}>
          {/* Weekly report */}
          <ReportCard
            label="이번 주"
            report={weeklyReport}
            isGenerating={generateWeekly.isPending}
            onRetry={() => generateWeekly.mutate()}
          />

          {/* Monthly report — Plus only */}
          {isPlus && (
            <ReportCard
              label="이번 달"
              report={monthlyReport}
              isGenerating={generateMonthly.isPending}
              onRetry={() => generateMonthly.mutate()}
            />
          )}

          {/* Mood trend */}
          <View style={[styles.card, {
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: spacing.base,
            marginBottom: spacing.sm,
          }]}>
            <Text style={[styles.cardLabel, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
              30일 기분 흐름
            </Text>
            <MoodTrendChart moods={moodData} />
            <View style={styles.moodLegend}>
              {MOOD_VALUES.map((mood) => (
                <View key={mood} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: MOOD_COLORS[mood - 1] }]} />
                  <MoodFace mood={mood} size={18} />
                </View>
              ))}
            </View>
          </View>

          {/* Pattern cards */}
          <Text style={[styles.sectionTitle, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
            패턴
          </Text>
          <PatternSection items={memoryItems} isPlus={isPlus} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 12, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 28 },
  plusChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  plusText: { color: '#fff', fontSize: 13 },
  card: {},
  cardLabel: { fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardBody: { fontSize: 14, lineHeight: 20 },
  generatingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  generatingText: { fontSize: 14 },
  reportSummary: { fontSize: 16, lineHeight: 24, marginBottom: 12 },
  reportArc: { fontSize: 14, lineHeight: 22, marginBottom: 12, opacity: 0.85 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  themeChip: { fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  sectionBlock: { marginBottom: 12 },
  sectionMiniLabel: { fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  bulletItem: { fontSize: 14, lineHeight: 22 },
  suggestionBox: { padding: 12, marginBottom: 4 },
  suggestionText: { fontSize: 14, lineHeight: 21 },
  vsPrevious: { fontSize: 13, lineHeight: 20, marginTop: 8, fontStyle: 'italic' },
  patternTeaser: { padding: 12, marginTop: 4 },
  patternTeaserText: { fontSize: 13, lineHeight: 20 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 8 },
  chartEmpty: { fontSize: 13, lineHeight: 20, paddingVertical: 12 },
  moodLegend: { flexDirection: 'row', justifyContent: 'flex-start', gap: 12, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  iconRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  rowIcon: { marginTop: 2 },
  rowText: { flexShrink: 1 },
  sectionTitle: { fontSize: 12, marginBottom: 10, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  lockedTitle: { fontSize: 15, marginBottom: 6 },
  lockedHint: { fontSize: 13, lineHeight: 20 },
  noPatterns: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  patternCard: {},
  patternCategory: { fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  patternContent: { fontSize: 15, lineHeight: 22 },
});
