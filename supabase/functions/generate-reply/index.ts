import { createClient } from 'npm:@supabase/supabase-js@2';
import { getClient, MODEL_FREE, MODEL_PLUS, MODEL_UTILITY, extractUsage } from '../_shared/anthropic.ts';
import { preCheck } from '../_shared/safety/keywords.ts';
import { checkQuota } from '../_shared/quota.ts';
import { buildContext } from '../_shared/context.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const REPLY_PROMPT_VERSION = 'reply.v1';

// Cached static system prompt prefix
async function loadSystemPrompt(): Promise<string> {
  const replyPrompt = await Deno.readTextFile('./supabase/functions/_shared/prompts/reply.v1.md');
  const frameworks = await Deno.readTextFile('./supabase/functions/_shared/prompts/frameworks.md');
  return replyPrompt.replace('{{FRAMEWORKS}}', frameworks);
}

const CRISIS_RESPONSE = `지금 많이 힘드신 것 같아요. 혼자 감당하기 어려운 순간에는 도움을 요청하는 것이 용기 있는 일이에요.

아래 전문가들이 지금 연결을 기다리고 있어요:
• 자살예방상담전화: 109 (24시간)
• 정신건강위기상담전화: 1577-0199 (24시간)
• 긴급구조: 112 / 119`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return errorResponse('Unauthorized', 401);
    }

    // Verify JWT
    const userSupabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { entryId } = await req.json();
    if (!entryId) return errorResponse('entryId required', 400);

    // Load entry
    const { data: entry, error: entryError } = await serviceSupabase
      .from('entries')
      .select('*')
      .eq('id', entryId)
      .eq('user_id', user.id)
      .single();
    if (entryError || !entry) return errorResponse('Entry not found', 404);
    if (entry.memory_mode === 'private') return errorResponse('private entries have no reply', 400);

    // Load profile
    const { data: profile } = await serviceSupabase
      .from('profiles')
      .select('plan, consent_ai_at')
      .eq('id', user.id)
      .single();

    if (!profile?.consent_ai_at) return errorResponse('AI consent required', 403);

    const plan = profile.plan as 'free' | 'plus';

    // Quota check
    const quota = await checkQuota(serviceSupabase, user.id, plan);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: 'quota_exceeded', remaining: 0 }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // Safety pre-check
    const preCheckResult = preCheck(entry.content);

    let safetyRisk: 'none' | 'elevated' | 'crisis' = preCheckResult;

    // LLM safety classifier (even if pre-check is none, run for accuracy)
    if (safetyRisk !== 'crisis') {
      const anthropic = getClient();
      const safetyRes = await anthropic.messages.create({
        model: MODEL_UTILITY,
        max_tokens: 100,
        system: 'You are a safety classifier for a Korean diary app. Classify the risk level of the diary entry.',
        messages: [{
          role: 'user',
          content: `Classify this Korean diary entry as one of: none, elevated, crisis.\n\nEntry:\n${entry.content}\n\nRespond with JSON only: {"risk": "none"|"elevated"|"crisis", "reason": "brief reason"}`,
        }],
      });

      await serviceSupabase.from('usage_events').insert({
        user_id: user.id,
        kind: 'safety',
        model: MODEL_UTILITY,
        input_tokens: safetyRes.usage.input_tokens,
        output_tokens: safetyRes.usage.output_tokens,
      });

      try {
        const safetyJson = JSON.parse(safetyRes.content[0].type === 'text' ? safetyRes.content[0].text : '{}');
        if (safetyJson.risk === 'crisis') safetyRisk = 'crisis';
        else if (safetyJson.risk === 'elevated' && safetyRisk !== 'crisis') safetyRisk = 'elevated';
      } catch {}
    }

    // Handle crisis
    if (safetyRisk === 'crisis') {
      const { data: savedReply } = await serviceSupabase
        .from('replies')
        .insert({
          entry_id: entryId,
          user_id: user.id,
          content: CRISIS_RESPONSE,
          kind: 'safety',
          model: 'none',
          prompt_version: REPLY_PROMPT_VERSION,
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
        })
        .select()
        .single();

      await serviceSupabase.from('entries').update({ safety_flag: true }).eq('id', entryId);

      return jsonResponse({ reply: savedReply, kind: 'safety' });
    }

    // Build context
    const context = await buildContext({
      userId: user.id,
      entryId,
      entryContent: entry.content,
      plan,
      supabase: serviceSupabase,
    });

    // Load last 3 reply openings for anti-repetition
    const { data: lastReplies } = await serviceSupabase
      .from('replies')
      .select('content')
      .eq('user_id', user.id)
      .eq('kind', 'normal')
      .order('created_at', { ascending: false })
      .limit(3);

    const lastOpenings = lastReplies
      ?.map((r) => r.content.split('\n')[0].slice(0, 60))
      .join('\n') ?? '(none)';

    // Load and build system prompt
    let systemPrompt: string;
    try {
      systemPrompt = await loadSystemPrompt();
    } catch {
      // Fallback: inline prompt if file read fails in Edge Function env
      const frameworks = `CBT, ACT, self-compassion, NVC frameworks for diary replies`;
      systemPrompt = `You are a warm AI diary companion. Write a personal reply in Korean (해요체). Mirror specific details. Never use stock phrases. One small helpful perspective. About 300-500 Korean characters.\n\n${frameworks}`;
    }

    systemPrompt = systemPrompt.replace('{{LAST_REPLY_OPENINGS}}', lastOpenings);

    const userMessage = `## User's diary entry
${entry.content}

## What I remember about this person
${context.memoryItems}

## Recent entries (summaries)
${context.recentEntries}

${safetyRisk === 'elevated' ? '## Note\nThis entry has signs of distress. Write with extra warmth. Gently mention that professional support is available.' : ''}

Write a personal reply to this diary entry. Output only the reply text, no headers.`;

    // Call Claude
    const model = plan === 'plus' ? MODEL_PLUS : MODEL_FREE;
    const anthropic = getClient();

    const response = await anthropic.messages.create({
      model,
      max_tokens: 600,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          // Prompt caching on the static system prompt
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
    });

    const replyText = response.content[0].type === 'text' ? response.content[0].text : '';
    const usage = extractUsage(response);

    // Save reply
    const { data: savedReply, error: replyError } = await serviceSupabase
      .from('replies')
      .insert({
        entry_id: entryId,
        user_id: user.id,
        content: replyText,
        kind: 'normal',
        model,
        prompt_version: REPLY_PROMPT_VERSION,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_tokens: usage.cache_read_input_tokens,
      })
      .select()
      .single();

    if (replyError) throw replyError;

    // Log usage event
    await serviceSupabase.from('usage_events').insert({
      user_id: user.id,
      kind: 'reply',
      model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
    });

    // Update safety flag if elevated
    if (safetyRisk === 'elevated') {
      await serviceSupabase.from('entries').update({ safety_flag: true }).eq('id', entryId);
    }

    // Kick off async processing for remember-mode entries
    if (entry.memory_mode === 'remember') {
      EdgeRuntime.waitUntil(triggerProcessEntry(user.id, entryId, auth));
    }

    return jsonResponse({ reply: savedReply, kind: 'normal' });

  } catch (err) {
    console.error('generate-reply error:', err);
    return errorResponse('Internal error', 500);
  }
});

async function triggerProcessEntry(userId: string, entryId: string, auth: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/process-entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ entryId }),
    });
  } catch (err) {
    console.error('process-entry trigger failed:', err);
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };
