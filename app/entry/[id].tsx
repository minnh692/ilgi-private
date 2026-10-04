import { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Animated, Easing, AccessibilityInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { QuotaExceededSheet } from '@/components/QuotaExceededSheet';
import { FREE_LAUNCH, hasPlusFeatures } from '@/lib/plan';
import type { Database } from '@/types/database';
import Constants from 'expo-constants';
import WritingArt from '../../assets/brand/svg/muni-writing.svg';
import Paw from '../../assets/brand/svg/muni-paw.svg';

type Entry = Database['public']['Tables']['entries']['Row'];
type Reply = Database['public']['Tables']['replies']['Row'];

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl as string;

function ReplyCard({ reply, isFirstEntry }: { reply: Reply; isFirstEntry: boolean }) {
  const { colors, typography, spacing, radius, shadow } = useTheme();
  const qc = useQueryClient();

  const isSafety = reply.kind === 'safety';
  const memoryNotes: string[] = isFirstEntry && !isSafety ? (reply.memory_notes ?? []) : [];

  const rateMutation = useMutation({
    mutationFn: async (rating: number) => {
      const { error } = await supabase
        .from('replies')
        .update({ rating: rating as number | null })
        .eq('id', reply.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reply', reply.entry_id] }),
  });

  return (
    <View
      style={[
        styles.replyCard,
        {
          backgroundColor: isSafety ? colors.errorLight : colors.surfaceAlt,
          borderRadius: radius.lg,
          padding: spacing.xl,
          ...(isSafety ? {} : shadow.sm),
        },
      ]}
    >
      <Text style={[
        styles.replyLabel,
        { color: isSafety ? colors.error : colors.subtext, fontFamily: typography.fontFamily.medium },
      ]}>
        {isSafety ? '위기상담 안내' : 'AI 고양이 무늬의 답장'}
      </Text>
      <Text style={[styles.replyContent, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
        {reply.content}
      </Text>
      {/* Safety replies drop the persona entirely — no signature */}
      {!isSafety && (
        <View style={styles.replySignature}>
          <Paw width={14} height={14} color={colors.subtext} />
          <Text style={[styles.replySignatureText, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
            — 무늬
          </Text>
        </View>
      )}

      {memoryNotes.length > 0 && (
        <View style={[styles.memoryNote, { backgroundColor: colors.accentLight, borderRadius: radius.md }]}>
          <Text style={[styles.memoryNoteTitle, { color: colors.accent, fontFamily: typography.fontFamily.semiBold }]}>
            기억해둘게요
          </Text>
          {memoryNotes.map((note, i) => (
            <Text key={i} style={[styles.memoryNoteItem, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
              • {note}
            </Text>
          ))}
        </View>
      )}

      {!isSafety && (
        <View style={styles.ratingRow}>
          {[
            { rating: 1, label: '도움이 됐어요', withPaw: true },
            { rating: -1, label: '별로예요', withPaw: false },
          ].map(({ rating, label, withPaw }) => (
            <Pressable
              key={rating}
              onPress={() => rateMutation.mutate(rating)}
              style={[
                styles.ratingBtn,
                {
                  borderColor: reply.rating === rating ? colors.accent : colors.border,
                  borderRadius: radius.full,
                  backgroundColor: reply.rating === rating ? colors.accentLight : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              {withPaw && <Paw width={16} height={16} color={reply.rating === rating ? colors.accent : colors.subtext} />}
              <Text style={[styles.ratingLabel, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// Server error codes from generate-reply → what we tell the user
const REPLY_ERROR_COPY: Record<string, string> = {
  ai_busy: '지금 무늬에게 답장 요청이 몰려 있어요.\n잠시 후 다시 시도해 주세요.',
  ai_unavailable: '지금은 무늬가 답장을 쓸 수 없어요.\n잠시 후 다시 시도해 주세요.',
};

/** Shown instead of a reply for anonymous accounts: AI replies require a linked account. */
function LoginForReply() {
  const { colors, typography, spacing, radius } = useTheme();
  return (
    <View style={[styles.generatingCard, { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: spacing.xl }]}>
      <Paw width={28} height={28} color={colors.accent} />
      <Text style={[styles.generatingText, { color: colors.text, fontFamily: typography.fontFamily.semiBold, textAlign: 'center' }]}>
        로그인하면 무늬가 답장을 써드려요
      </Text>
      <Text style={[styles.loginHint, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
        지금까지 쓴 일기는 연결한 계정으로 그대로 옮겨져요.
      </Text>
      <Pressable
        onPress={() => router.push({ pathname: '/login', params: { mode: 'link' } })}
        style={[styles.loginBtn, { backgroundColor: colors.accent, borderRadius: radius.md }]}
        accessibilityRole="button"
        accessibilityLabel="로그인하고 답장 받기"
      >
        <Text style={[styles.loginBtnText, { fontFamily: typography.fontFamily.semiBold }]}>
          로그인하고 답장 받기
        </Text>
      </Pressable>
    </View>
  );
}

// muni-writing.svg viewBox is 240×200
const WRITING_ART_WIDTH = 200;
const WRITING_ART_ASPECT = 200 / 240;

function GeneratingReply() {
  const { colors, typography, spacing, radius } = useTheme();
  const [bob] = useState(() => new Animated.Value(0));

  // Slow 3px bob while 무늬 writes; skipped when the user prefers reduced motion
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      const half = { duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true };
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(bob, { toValue: -3, ...half }),
          Animated.timing(bob, { toValue: 0, ...half }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [bob]);

  return (
    <View
      style={[
        styles.generatingCard,
        {
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.lg,
          padding: spacing.xl,
        },
      ]}
    >
      <Animated.View style={{ transform: [{ translateY: bob }] }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <WritingArt width={WRITING_ART_WIDTH} height={WRITING_ART_WIDTH * WRITING_ART_ASPECT} />
      </Animated.View>
      <Text accessibilityLiveRegion="polite" style={[styles.generatingText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
        무늬가 답장을 쓰고 있어요
      </Text>
    </View>
  );
}

export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, typography, spacing, radius, shadow } = useTheme();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const qc = useQueryClient();

  const [quotaSheetVisible, setQuotaSheetVisible] = useState(false);
  const paywallTriggeredRef = useRef(false);

  const isAnonymous = user?.is_anonymous ?? true;

  const { data: entry, isLoading: entryLoading } = useQuery({
    queryKey: ['entry', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entries')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Entry;
    },
    enabled: !!id,
  });

  const { data: reply, isLoading: replyLoading } = useQuery({
    queryKey: ['reply', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('replies')
        .select('*')
        .eq('entry_id', id)
        .maybeSingle();
      if (error) throw error;
      return data as Reply | null;
    },
    enabled: !!id,
    refetchInterval: (query) => (query.state.data == null ? 3000 : false),
    refetchIntervalInBackground: false,
  });

  // Entry count — declared before paywall useEffect so isFirstEntry is in scope
  const { data: entryCount = 0 } = useQuery({
    queryKey: ['entry_count', user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id);
      return count ?? 0;
    },
    enabled: !!user,
  });
  const isFirstEntry = entryCount <= 1;

  // Show paywall after first reply, once, for non-plus users
  useEffect(() => {
    // Never follow a crisis response with an upsell
    if (!reply || reply.kind === 'safety' || !isFirstEntry || paywallTriggeredRef.current) return;
    if (FREE_LAUNCH || profile?.plan === 'plus') return;
    const state = (profile?.onboarding_state as Record<string, unknown>) ?? {};
    if (state.paywallShown) return;

    paywallTriggeredRef.current = true;
    const timer = setTimeout(async () => {
      if (user) {
        supabase.from('profiles').update({
          onboarding_state: { ...state, paywallShown: true },
        }).eq('id', user.id).then(() => {});
      }
      router.push('/paywall');
    }, 2000);
    return () => clearTimeout(timer);
  // isFirstEntry changes once when entryCount loads — the ref prevents double-fire
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reply?.id, isFirstEntry]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/generate-reply`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ entryId: id }),
        }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as { error?: string; status?: number; upstream?: string };
        console.error('[entry] generate-reply failed', { http: response.status, error: err.error, status: err.status, upstream: err.upstream });
        throw new Error(err.error ?? 'Failed to generate reply');
      }
      return response.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reply', id] }),
    onError: (err: Error) => {
      if (err.message === 'quota_exceeded') {
        setQuotaSheetVisible(true);
      }
    },
  });

  // Auto-request a reply once when an entry has none (side effect, so it lives in an effect, not render)
  const hasTriggered = useRef(false);
  const { mutate: requestReply, isPending: replyPending } = generateMutation;
  useEffect(() => {
    // Anonymous accounts don't get AI replies (server returns login_required) — they see LoginForReply
    if (!entry || isAnonymous || replyLoading || reply !== null || replyPending || hasTriggered.current) return;
    hasTriggered.current = true;
    if (entry.memory_mode !== 'private') requestReply();
  }, [entry, isAnonymous, replyLoading, reply, replyPending, requestReply]);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries', user?.id] });
      router.back();
    },
  });

  function confirmDelete() {
    Alert.alert('일기 삭제', '이 일기를 삭제할까요? 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }

  if (entryLoading || !entry) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.accent} />
      </SafeAreaView>
    );
  }

  const dateStr = new Date(entry.entry_date).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { paddingHorizontal: spacing.base, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="뒤로">
          <Text style={[styles.backBtn, { color: colors.accent, fontFamily: typography.fontFamily.medium }]}>
            ← 뒤로
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push(`/entry/edit/${id}`)}
          accessibilityRole="button"
          accessibilityLabel="수정"
        >
          <Text style={[styles.editBtn, { color: colors.accent, fontFamily: typography.fontFamily.medium }]}>
            수정
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.base, paddingTop: spacing.base, paddingBottom: 48 }}
      >
        <Text style={[styles.dateStr, { color: colors.subtext, fontFamily: typography.fontFamily.medium }]}>
          {dateStr}
        </Text>

        <View
          style={[
            styles.entryBox,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              padding: spacing.base,
              marginTop: spacing.sm,
              marginBottom: spacing.md,
              ...shadow.sm,
            },
          ]}
        >
          {entry.title ? (
            <Text style={[styles.entryTitle, { color: colors.text, fontFamily: typography.fontFamily.semiBold }]}>
              {entry.title}
            </Text>
          ) : null}
          <Text style={[styles.entryContent, { color: colors.text, fontFamily: typography.fontFamily.regular }]}>
            {entry.content}
          </Text>
        </View>

        {/* Entry actions row */}
        <View style={[styles.entryActions, { marginBottom: spacing.xl }]}>
          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            accessibilityLabel="삭제"
          >
            <Text style={[styles.actionBtn, { color: colors.error, fontFamily: typography.fontFamily.regular }]}>
              삭제
            </Text>
          </Pressable>
        </View>

        {entry.memory_mode !== 'private' && (
          <>
            {generateMutation.isPending || (replyLoading && reply === null) ? (
              <GeneratingReply />
            ) : reply ? (
              <>
                <ReplyCard reply={reply} isFirstEntry={isFirstEntry && entry.memory_mode === 'remember'} />
                {/* Regenerate button — costs one quota */}
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      '답장 다시 받기',
                      '새 답장을 받으면 횟수가 차감돼요. 계속할까요?',
                      [
                        { text: '취소', style: 'cancel' },
                        { text: '다시 받기', onPress: () => generateMutation.mutate() },
                      ],
                    );
                  }}
                  disabled={generateMutation.isPending}
                  style={[styles.regenBtn, { borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="답장 다시 받기"
                >
                  <Text style={[styles.regenBtnText, { color: colors.subtext, fontFamily: typography.fontFamily.regular }]}>
                    답장 다시 받기
                  </Text>
                </Pressable>
              </>
            ) : isAnonymous || generateMutation.error?.message === 'login_required' ? (
              <LoginForReply />
            ) : generateMutation.isError && generateMutation.error.message !== 'quota_exceeded' ? (
              <View style={[styles.generatingCard, { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: spacing.xl }]}>
                <Text style={[styles.generatingText, { color: colors.subtext, fontFamily: typography.fontFamily.regular, textAlign: 'center' }]}>
                  {REPLY_ERROR_COPY[generateMutation.error.message] ?? '답장을 받지 못했어요.'}
                </Text>
                <Pressable
                  onPress={() => generateMutation.mutate()}
                  style={[styles.regenBtn, { borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="다시 시도"
                >
                  <Text style={[styles.regenBtnText, { color: colors.accent, fontFamily: typography.fontFamily.medium }]}>
                    다시 시도
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <QuotaExceededSheet
        visible={quotaSheetVisible}
        onDismiss={() => setQuotaSheetVisible(false)}
        plan={hasPlusFeatures(profile?.plan) ? 'plus' : 'free'}
      />
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
  backBtn: { fontSize: 16 },
  editBtn: { fontSize: 16 },
  dateStr: { fontSize: 14, marginBottom: 4 },
  entryActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  actionBtn: { fontSize: 14, padding: 4 },
  regenBtn: { marginTop: 12, borderWidth: 1, borderRadius: 8, padding: 12, alignItems: 'center' },
  regenBtnText: { fontSize: 14 },
  entryBox: {},
  entryTitle: { fontSize: 20, lineHeight: 28, marginBottom: 8 },
  entryContent: { fontSize: 16, lineHeight: 28 },
  replyCard: {},
  replyLabel: { fontSize: 12, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  replyContent: { fontSize: 16, lineHeight: 28, marginBottom: 12 },
  replySignature: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginBottom: 20 },
  replySignatureText: { fontSize: 15 },
  memoryNote: { padding: 14, marginBottom: 16 },
  memoryNoteTitle: { fontSize: 14, marginBottom: 6 },
  memoryNoteItem: { fontSize: 14, lineHeight: 21 },
  ratingRow: { flexDirection: 'row', gap: 10 },
  ratingBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1 },
  ratingLabel: { fontSize: 13 },
  generatingCard: { alignItems: 'center', gap: 12 },
  generatingText: { fontSize: 15, marginTop: 4 },
  loginHint: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  loginBtn: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 24 },
  loginBtnText: { color: '#fff', fontSize: 15 },
});
