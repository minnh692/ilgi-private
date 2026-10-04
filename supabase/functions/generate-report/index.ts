import { createClient } from 'npm:@supabase/supabase-js@2';
import { effectivePlan } from '../_shared/plan.ts';
import { getClient, MODEL_PLUS, MODEL_UTILITY } from '../_shared/anthropic.ts';
import { parseModelJson } from '../_shared/json.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function getWeekPeriod(date = new Date()) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function getMonthPeriod(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });

  try {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return errorResponse('Unauthorized', 401);

    const userSupabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userSupabase.auth.getUser();
    if (!user) return errorResponse('Unauthorized', 401);

    const serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const body = await req.json() as { kind?: string };
    const kind = (body.kind === 'monthly' ? 'monthly' : 'weekly') as 'weekly' | 'monthly';

    const { data: profile } = await serviceSupabase
      .from('profiles').select('plan, plan_expires_at, consent_ai_at').eq('id', user.id).single();
    if (!profile?.consent_ai_at) return errorResponse('AI consent required', 403);
    const plan = effectivePlan(profile);

    if (kind === 'monthly' && plan !== 'plus') {
      return errorResponse('Plus required for monthly reports', 403);
    }

    const period = kind === 'weekly' ? getWeekPeriod() : getMonthPeriod();

    // Return cached report if it exists for this period
    const { data: existing } = await serviceSupabase
      .from('reports')
      .select('*')
      .eq('user_id', user.id)
      .eq('kind', kind)
      .eq('period_start', period.start)
      .maybeSingle();
    if (existing) return jsonResponse({ report: existing });

    // Fetch entry IDs in the period (remember-mode only — those have insights)
    const { data: periodEntries } = await serviceSupabase
      .from('entries')
      .select('id')
      .eq('user_id', user.id)
      .eq('memory_mode', 'remember')
      .gte('entry_date', period.start)
      .lte('entry_date', period.end);

    const entryIds = (periodEntries ?? []).map((e) => e.id as string);

    const { data: insights } = entryIds.length
      ? await serviceSupabase
          .from('entry_insights')
          .select('summary, emotions, topics, people, events, coping')
          .in('entry_id', entryIds)
          .order('created_at', { ascending: true })
      : { data: [] };

    // Not persisted: once an entry is analysed, the next visit should generate a real report
    if (!insights?.length) {
      return jsonResponse({
        report: {
          id: null, user_id: user.id, kind,
          period_start: period.start, period_end: period.end,
          content: { summary: '이번 기간에 분석된 일기가 아직 없어요.', plan },
          created_at: new Date().toISOString(),
        },
      });
    }

    const anthropic = getClient();
    const summariesText = insights.map((ins, i) => `${i + 1}. ${ins.summary}`).join('\n');

    let reportContent: Record<string, unknown>;

    if (plan === 'free') {
      // Free: one-line summary + pattern count
      const { count: patternCount } = await serviceSupabase
        .from('memory_items')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['active', 'user_edited']);

      const res = await anthropic.messages.create({
        model: MODEL_UTILITY,
        max_tokens: 100,
        system: '한국 일기 앱의 분석가예요. 이번 주 일기 요약들을 읽고 이번 주의 감정 흐름을 한 문장으로 요약해 주세요. JSON만 출력하세요.',
        messages: [{
          role: 'user',
          content: `주간 일기 요약:\n${summariesText}\n\nJSON: {"summary": "한 문장 요약"}`,
        }],
      });
      await serviceSupabase.from('usage_events').insert({
        user_id: user.id, kind: 'report', model: MODEL_UTILITY,
        input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens,
      });
      const text = res.content[0].type === 'text' ? res.content[0].text : '{}';
      const parsed = parseModelJson<{ summary?: string }>(text);
      reportContent = {
        summary: parsed.summary ?? '이번 주 감정을 기록했어요.',
        pattern_count: patternCount ?? 0,
        plan: 'free',
      };
    } else {
      // Plus: full structured report
      const { data: memoryItems } = await serviceSupabase
        .from('memory_items')
        .select('category, content')
        .eq('user_id', user.id)
        .in('status', ['active', 'user_edited'])
        .order('confidence', { ascending: false })
        .limit(10);

      const memoryText = memoryItems?.length
        ? '\n\n알려진 패턴:\n' + memoryItems.map((m) => `- [${m.category}] ${m.content}`).join('\n')
        : '';

      let prevSummaryText = '';
      if (kind === 'monthly') {
        const prevDate = new Date();
        prevDate.setMonth(prevDate.getMonth() - 1);
        const prevPeriod = getMonthPeriod(prevDate);
        const { data: prevReport } = await serviceSupabase
          .from('reports').select('content')
          .eq('user_id', user.id).eq('kind', 'monthly')
          .eq('period_start', prevPeriod.start).maybeSingle();
        if (prevReport) {
          const c = prevReport.content as { summary?: string };
          if (c.summary) prevSummaryText = `\n\n지난 달 요약: ${c.summary}`;
        }
      }

      const periodLabel = kind === 'weekly' ? '주간' : '월간';
      const schema = kind === 'weekly'
        ? `{"summary":"이번 주 한 줄 요약","emotional_arc":"감정 흐름 2-3문장","themes":["주제1"],"people":["이름1"],"what_helped":["도움된 것"],"suggestion":"다음 주를 위한 한 가지 제안"}`
        : `{"summary":"이달 한 줄 요약","emotional_arc":"감정 흐름 2-3문장","themes":["주제1"],"what_helped":["도움된 것"],"suggestion":"다음 달을 위한 한 가지 제안","vs_previous":"이전 달과의 비교 또는 null"}`;

      const res = await anthropic.messages.create({
        model: MODEL_PLUS,
        max_tokens: 700,
        system: `한국 정신건강 웰니스 앱의 ${periodLabel} 리포트 작성가예요. 따뜻하고 통찰력 있는 ${periodLabel} 리포트를 한국어 해요체로 작성해 주세요. 진단하지 마세요. JSON만 출력하세요.`,
        messages: [{
          role: 'user',
          content: `${periodLabel} 기간: ${period.start} ~ ${period.end}\n\n일기 요약:\n${summariesText}${memoryText}${prevSummaryText}\n\nJSON:\n${schema}`,
        }],
      });
      await serviceSupabase.from('usage_events').insert({
        user_id: user.id, kind: 'report', model: MODEL_PLUS,
        input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens,
      });
      const text = res.content[0].type === 'text' ? res.content[0].text : '{}';
      const parsed = parseModelJson<Record<string, unknown>>(text);
      reportContent = { ...parsed, plan: 'plus' };
    }

    const { data: saved } = await serviceSupabase.from('reports').insert({
      user_id: user.id, kind,
      period_start: period.start, period_end: period.end,
      content: reportContent,
    }).select().single();

    return jsonResponse({ report: saved });
  } catch (err) {
    console.error('generate-report error:', err);
    return errorResponse('Internal error', 500);
  }
});

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
