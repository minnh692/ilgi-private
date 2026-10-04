import { createClient } from 'npm:@supabase/supabase-js@2';
import { getClient, MODEL_FREE, MODEL_PLUS, MODEL_UTILITY, extractUsage, classifyAnthropicError } from '../_shared/anthropic.ts';
import { preCheck } from '../_shared/safety/keywords.ts';
import { reserveReplySlot, finalizeReplySlot, releaseReplySlot } from '../_shared/quota.ts';
import { buildContext } from '../_shared/context.ts';
import { parseModelJson } from '../_shared/json.ts';
import { buildUserNote } from '../_shared/userProfile.ts';
import { effectivePlan } from '../_shared/plan.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REPLY_PROMPT_VERSION = 'reply.v2';
const PROCESS_RETRY_DELAYS_MS = [2_000, 8_000];
// How many earlier unprocessed entries to retry per reply
const STALE_MEMORY_SWEEP = 3;

// Inline prompts — loaded at cold start so file I/O doesn't block requests
let _systemPrompt: string | null = null;

async function getSystemPrompt(): Promise<string> {
  if (_systemPrompt) return _systemPrompt;
  try {
    const reply = await Deno.readTextFile(new URL('../_shared/prompts/reply.v2.md', import.meta.url));
    const frameworks = await Deno.readTextFile(new URL('../_shared/prompts/frameworks.md', import.meta.url));
    _systemPrompt = reply.replace('{{FRAMEWORKS}}', frameworks);
  } catch {
    _systemPrompt = `You are 무늬, an AI cat diary companion. Write a personal reply in natural Korean (해요체).
No cat speech ("냥" etc.), no emoji, and do not sign the reply — the app adds "— 무늬".
Stay in 해요체 throughout (never ~입니다/~습니다) and never address the user as "당신".
If a nickname is given, call them "{nickname}님" once or twice; on their birthday add a short, warm wish.
Mirror specific details from the entry. Never open with stock phrases like "힘드셨겠어요".
One small helpful perspective. About 300-500 Korean characters.

CBT, ACT, self-compassion, NVC, behavioral activation frameworks — apply one naturally, never as a label.`;
  }
  return _systemPrompt;
}

const CRISIS_RESPONSE = `지금 많이 힘드신 것 같아요. 혼자 감당하기 어려운 순간에는 도움을 요청하는 것이 용기 있는 일이에요.

아래 전문가들이 지금 연결을 기다리고 있어요:
• 자살예방상담전화: 109 (24시간)
• 정신건강위기상담전화: 1577-0199 (24시간)
• 긴급구조: 112 / 119`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });

  const serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  // Reserved quota slot; released in the catch below if generation fails before the reply is saved
  let slotId: string | null = null;

  try {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return errorResponse('Unauthorized', 401);

    const userSupabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const { entryId } = await req.json();
    if (!entryId) return errorResponse('entryId required', 400);

    // Load entry
    const { data: entry } = await serviceSupabase
      .from('entries').select('*').eq('id', entryId).eq('user_id', user.id).single();
    if (!entry) return errorResponse('Entry not found', 404);
    if (entry.memory_mode === 'private') return errorResponse('private entries have no reply', 400);

    // Load profile
    const { data: profile } = await serviceSupabase
      .from('profiles').select('plan, plan_expires_at, consent_ai_at, nickname, birth_date, timezone').eq('id', user.id).single();
    if (!profile?.consent_ai_at) return errorResponse('AI consent required', 403);

    const plan = effectivePlan(profile);

    // Crisis replies are a fixed message (no model call), so they never consume or wait on quota
    async function respondCrisis() {
      const { data: savedReply } = await serviceSupabase
        .from('replies')
        .insert({
          entry_id: entryId, user_id: user!.id,
          content: CRISIS_RESPONSE, kind: 'safety',
          model: 'none', prompt_version: REPLY_PROMPT_VERSION,
          input_tokens: 0, output_tokens: 0, cache_read_tokens: 0,
          memory_notes: [],
        })
        .select().single();
      await serviceSupabase.from('entries').update({ safety_flag: true }).eq('id', entryId);
      return jsonResponse({ reply: savedReply, kind: 'safety' });
    }

    // Safety: keyword pre-check (free) — before the quota, so crisis resources are never blocked by limits
    let safetyRisk: 'none' | 'elevated' | 'crisis' = preCheck(entry.content);
    if (safetyRisk === 'crisis') return await respondCrisis();

    // AI replies are for signed-in (social login) accounts only: anonymous accounts are free to
    // recreate, so per-account free quota alone can't stop unlimited replies via reinstalling
    if (user.is_anonymous) return errorResponse('login_required', 403);

    // Quota: atomically reserve a slot (concurrent requests can't overshoot the limit)
    slotId = await reserveReplySlot(serviceSupabase, user.id, plan, profile.timezone);
    if (!slotId) {
      return new Response(JSON.stringify({ error: 'quota_exceeded', remaining: 0 }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // Detect first entry (for 기억해둘게요 block)
    const { count: entryCount } = await serviceSupabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    const isFirstEntry = (entryCount ?? 0) <= 1;

    // Safety: LLM classifier
    {
      const anthropic = getClient();
      const safetyRes = await anthropic.messages.create({
        model: MODEL_UTILITY,
        max_tokens: 100,
        system: 'Classify the risk level of this Korean diary entry. Output only JSON.',
        messages: [{
          role: 'user',
          content: `Classify: "none", "elevated", or "crisis".\n\n${entry.content}\n\nJSON: {"risk":"none"|"elevated"|"crisis","reason":"brief"}`,
        }],
      });
      await serviceSupabase.from('usage_events').insert({
        user_id: user.id, kind: 'safety', model: MODEL_UTILITY,
        input_tokens: safetyRes.usage.input_tokens, output_tokens: safetyRes.usage.output_tokens,
      });
      try {
        const parsed = parseModelJson<{ risk?: string }>(safetyRes.content[0].type === 'text' ? safetyRes.content[0].text : '{}');
        if (parsed.risk === 'crisis') safetyRisk = 'crisis';
        else if (parsed.risk === 'elevated') safetyRisk = 'elevated';
      } catch { /* keep pre-check result */ }
    }

    // Crisis via classifier: hand the slot back, then respond without the persona
    if (safetyRisk === 'crisis') {
      await releaseReplySlot(serviceSupabase, slotId);
      slotId = null;
      return await respondCrisis();
    }

    // Build context
    const context = await buildContext({
      userId: user.id, entryId, entryContent: entry.content, plan, supabase: serviceSupabase,
    });

    // Anti-repetition: last 3 reply openings
    const { data: lastReplies } = await serviceSupabase
      .from('replies').select('content')
      .eq('user_id', user.id).eq('kind', 'normal')
      .order('created_at', { ascending: false }).limit(3);
    const lastOpenings = lastReplies
      ?.map((r: { content: string }) => r.content.split('\n')[0].slice(0, 60)).join('\n') ?? '(none)';

    // System prompt is identical for every user so it can be served from the prompt cache;
    // everything per-user (incl. recent openings) goes in the user message
    const systemPrompt = await getSystemPrompt();

    const userMessage = [
      ...buildUserNote({ nickname: profile.nickname, birthDate: profile.birth_date, entryDate: entry.entry_date }),
      '## User\'s diary entry',
      ...(entry.title ? [`Title: ${entry.title}`, ''] : []),
      entry.content,
      '',
      '## What I remember about this person',
      context.memoryItems,
      '',
      '## Recent entries (summaries)',
      context.recentEntries,
      '',
      '## Your recent reply openings',
      lastOpenings || '(none)',
      ...(safetyRisk === 'elevated'
        ? ['', '## Note', 'Entry shows distress. Extra warmth, no playful cat touches. Gently mention professional support is available.']
        : []),
      '',
      'Write a personal reply. Output only the reply text, no headers.',
    ].join('\n');

    const model = plan === 'plus' ? MODEL_PLUS : MODEL_FREE;
    const anthropic = getClient();

    const response = await anthropic.messages.create({
      model,
      max_tokens: 600,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    });

    const replyText = response.content[0].type === 'text' ? response.content[0].text : '';
    const usage = extractUsage(response);

    // Generate 기억해둘게요 notes for first remember-mode entry
    let memoryNotes: string[] = [];
    if (isFirstEntry && entry.memory_mode === 'remember') {
      try {
        const notesRes = await anthropic.messages.create({
          model: MODEL_UTILITY,
          max_tokens: 200,
          system: 'You extract 2 specific, concrete things from a Korean diary entry that an AI companion will remember about the person. Output only a JSON array of exactly 2 short Korean strings (under 30 chars each). Be specific to what was written.',
          messages: [{
            role: 'user',
            content: `Diary entry:\n${entry.content}\n\nOutput JSON array only: ["thing1", "thing2"]`,
          }],
        });
        await serviceSupabase.from('usage_events').insert({
          user_id: user.id, kind: 'extract', model: MODEL_UTILITY,
          input_tokens: notesRes.usage.input_tokens, output_tokens: notesRes.usage.output_tokens,
        });
        const raw = notesRes.content[0].type === 'text' ? notesRes.content[0].text : '[]';
        const parsed = parseModelJson(raw);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          memoryNotes = parsed.slice(0, 2).map(String);
        }
      } catch (e) {
        console.error('memory notes generation failed:', e);
      }
    }

    // Save reply
    const { data: savedReply, error: replyError } = await serviceSupabase
      .from('replies')
      .insert({
        entry_id: entryId, user_id: user.id,
        content: replyText, kind: 'normal',
        model, prompt_version: REPLY_PROMPT_VERSION,
        input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
        cache_read_tokens: usage.cache_read_input_tokens,
        memory_notes: memoryNotes,
      })
      .select().single();

    if (replyError) throw replyError;

    // Reply is saved — the slot is now spent; record what it actually used
    const spentSlot = slotId;
    slotId = null;
    await finalizeReplySlot(serviceSupabase, spentSlot, {
      model, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
    });

    if (safetyRisk === 'elevated') {
      await serviceSupabase.from('entries').update({ safety_flag: true }).eq('id', entryId);
    }

    // Async memory processing (user never waits): this entry if it isn't processed yet (not on
    // every regenerate), plus a few of the user's earlier entries whose processing failed
    EdgeRuntime.waitUntil((async () => {
      if (entry.memory_mode === 'remember' && !entry.memory_processed_at) {
        await triggerProcessEntry(entryId, auth);
      }
      const { data: stale } = await serviceSupabase
        .from('entries').select('id')
        .eq('user_id', user.id).eq('memory_mode', 'remember').is('memory_processed_at', null)
        .neq('id', entryId)
        .lt('created_at', new Date(Date.now() - 10 * 60_000).toISOString())
        .gt('created_at', new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString())
        .order('created_at', { ascending: false })
        .limit(STALE_MEMORY_SWEEP);
      for (const { id } of stale ?? []) await triggerProcessEntry(id, auth);
    })());

    return jsonResponse({ reply: savedReply, kind: 'normal' });

  } catch (err) {
    if (slotId) await releaseReplySlot(serviceSupabase, slotId);

    // Capacity problems get their own codes so the app can say "try again shortly"
    const capacity = classifyAnthropicError(err);
    if (capacity) {
      console.error(JSON.stringify({ fn: 'generate-reply', capacity }));
      return errorResponse(capacity === 'spend_cap' ? 'ai_unavailable' : 'ai_busy', 503);
    }

    // Only status/type are surfaced — never diary content
    const e = err as { status?: number; error?: { error?: { type?: string; message?: string } }; name?: string; code?: string };
    const upstream = e.error?.error?.type ?? e.code ?? e.name ?? 'unknown';
    // Anthropic error messages describe the request problem, not its content
    const detail = e.error?.error?.message?.slice(0, 200) ?? null;
    console.error(JSON.stringify({ fn: 'generate-reply', status: e.status ?? null, upstream, detail }));
    return new Response(JSON.stringify({ error: 'internal_error', status: e.status ?? null, upstream, detail }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
});

// Retries transient failures; anything still failing stays unprocessed (memory_processed_at null)
// and is picked up by a later generate-reply's sweep
async function triggerProcessEntry(entryId: string, auth: string) {
  for (let attempt = 0; attempt < PROCESS_RETRY_DELAYS_MS.length + 1; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, PROCESS_RETRY_DELAYS_MS[attempt - 1]));
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/process-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ entryId }),
      });
      if (res.ok) return;
      if (res.status < 500) break; // client error — retrying won't help
    } catch { /* network error — retry */ }
  }
  console.error(JSON.stringify({ fn: 'generate-reply', op: 'process-entry', failed: true }));
}

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

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };
