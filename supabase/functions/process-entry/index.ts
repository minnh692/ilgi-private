import { createClient } from 'npm:@supabase/supabase-js@2';
import { getClient, MODEL_UTILITY, extractUsage } from '../_shared/anthropic.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_MEMORY_ITEMS = 40;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return errorResponse('Unauthorized', 401);

    const userSupabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userSupabase.auth.getUser();
    if (!user) return errorResponse('Unauthorized', 401);

    const serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { entryId } = await req.json();

    const { data: entry } = await serviceSupabase
      .from('entries')
      .select('*')
      .eq('id', entryId)
      .eq('user_id', user.id)
      .single();

    if (!entry || entry.memory_mode !== 'remember') {
      return jsonResponse({ skipped: true });
    }

    const anthropic = getClient();

    // Step 1: Extract insights
    const extractRes = await anthropic.messages.create({
      model: MODEL_UTILITY,
      max_tokens: 800,
      system: 'You are an insight extractor for a Korean diary app. Extract structured insights from the diary entry. Output only valid JSON.',
      messages: [{
        role: 'user',
        content: `Extract insights from this Korean diary entry. Output JSON matching this schema:
{
  "summary": "1-2 sentence summary in Korean",
  "emotions": [{"name": "감정명", "intensity": 1-5}],
  "people": ["이름/호칭"],
  "topics": ["주제"],
  "events": ["주요 사건"],
  "coping": ["대처 행동"]
}

Diary entry:
${entry.content}`,
      }],
    });

    const usage1 = extractUsage(extractRes);
    await serviceSupabase.from('usage_events').insert({
      user_id: user.id,
      kind: 'extract',
      model: MODEL_UTILITY,
      input_tokens: usage1.input_tokens,
      output_tokens: usage1.output_tokens,
    });

    let insights;
    try {
      const text = extractRes.content[0].type === 'text' ? extractRes.content[0].text : '{}';
      insights = JSON.parse(text);
    } catch {
      console.error('Failed to parse insights JSON');
      return errorResponse('parse error', 500);
    }

    // Save insights
    await serviceSupabase.from('entry_insights').upsert({
      entry_id: entryId,
      user_id: user.id,
      summary: insights.summary ?? '',
      emotions: insights.emotions ?? [],
      people: insights.people ?? [],
      topics: insights.topics ?? [],
      events: insights.events ?? [],
      coping: insights.coping ?? [],
    });

    // Step 2: Resolve people
    if (insights.people?.length) {
      const { data: existingPeople } = await serviceSupabase
        .from('people')
        .select('id, display_name, aliases')
        .eq('user_id', user.id);

      for (const name of insights.people as string[]) {
        const match = existingPeople?.find(
          (p) =>
            p.display_name === name ||
            (p.aliases as string[]).includes(name)
        );

        if (match) {
          await serviceSupabase
            .from('people')
            .update({
              mention_count: (match as { mention_count?: number }).mention_count ?? 0 + 1,
              last_mentioned_at: new Date().toISOString(),
            })
            .eq('id', match.id);
        } else {
          // Conservative: only create if not too ambiguous
          if (name.length >= 2) {
            await serviceSupabase.from('people').insert({
              user_id: user.id,
              display_name: name,
              aliases: [],
              mention_count: 1,
              last_mentioned_at: new Date().toISOString(),
            });
          }
        }
      }
    }

    // Step 3: Merge memory
    const { data: currentItems } = await serviceSupabase
      .from('memory_items')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'user_edited']);

    const memoryMergeRes = await anthropic.messages.create({
      model: MODEL_UTILITY,
      max_tokens: 1500,
      system: 'You are a memory manager for a Korean diary AI. Merge new insights into existing memory items. Output only valid JSON.',
      messages: [{
        role: 'user',
        content: `Given the existing memory items and new insights from a diary entry, output a list of memory operations.

Rules:
- A pattern needs evidence from at least 2 entries
- Every item must cite evidence entry ids
- Wording must be neutral and non-diagnostic
- Never modify items with status "user_edited"
- Never recreate items with status "dismissed"
- Keep at most ${MAX_MEMORY_ITEMS} active items
- Keep content in Korean

Existing memory items:
${JSON.stringify(currentItems ?? [])}

New insights (entry_id: ${entryId}):
${JSON.stringify(insights)}

Output JSON:
{
  "operations": [
    {"op": "create", "category": "theme|person_pattern|value_goal|what_helps|trigger|preference", "content": "...", "evidence_entry_ids": ["..."], "confidence": 0.0-1.0},
    {"op": "update", "id": "existing-item-id", "content": "...", "evidence_entry_ids": ["..."], "confidence": 0.0-1.0},
    {"op": "noop"}
  ]
}`,
      }],
    });

    const usage2 = extractUsage(memoryMergeRes);
    await serviceSupabase.from('usage_events').insert({
      user_id: user.id,
      kind: 'memory',
      model: MODEL_UTILITY,
      input_tokens: usage2.input_tokens,
      output_tokens: usage2.output_tokens,
    });

    let mergeOps;
    try {
      const text = memoryMergeRes.content[0].type === 'text' ? memoryMergeRes.content[0].text : '{}';
      mergeOps = JSON.parse(text);
    } catch {
      console.error('Failed to parse memory merge JSON');
      return jsonResponse({ partial: true });
    }

    for (const op of mergeOps.operations ?? []) {
      if (op.op === 'create') {
        await serviceSupabase.from('memory_items').insert({
          user_id: user.id,
          category: op.category,
          content: op.content,
          evidence_entry_ids: op.evidence_entry_ids ?? [entryId],
          confidence: op.confidence ?? 0.5,
          status: 'active',
        });
      } else if (op.op === 'update' && op.id) {
        const existing = currentItems?.find((m) => m.id === op.id);
        if (existing && existing.status !== 'user_edited') {
          await serviceSupabase.from('memory_items').update({
            content: op.content,
            evidence_entry_ids: op.evidence_entry_ids,
            confidence: op.confidence,
          }).eq('id', op.id);
        }
      }
    }

    // Enforce cap: drop lowest confidence items if over limit
    const { data: allActive, count } = await serviceSupabase
      .from('memory_items')
      .select('id, confidence', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('confidence', { ascending: true });

    if ((count ?? 0) > MAX_MEMORY_ITEMS && allActive) {
      const toDelete = allActive.slice(0, (count ?? 0) - MAX_MEMORY_ITEMS).map((m) => m.id);
      await serviceSupabase.from('memory_items').delete().in('id', toDelete);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('process-entry error:', err);
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
