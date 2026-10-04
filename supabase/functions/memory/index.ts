import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    const body = await req.json() as Record<string, unknown>;
    const { action } = body;

    // Merge two people: add source aliases to target, delete source
    if (action === 'merge_people') {
      const { source_id, target_id } = body as { source_id: string; target_id: string };
      if (!source_id || !target_id) return errorResponse('source_id and target_id required', 400);

      const [{ data: source }, { data: target }] = await Promise.all([
        serviceSupabase.from('people').select('*').eq('id', source_id).eq('user_id', user.id).single(),
        serviceSupabase.from('people').select('*').eq('id', target_id).eq('user_id', user.id).single(),
      ]);

      if (!source || !target) return errorResponse('Person not found', 404);

      const mergedAliases = Array.from(new Set([
        ...((target.aliases as string[]) ?? []),
        source.display_name as string,
        ...((source.aliases as string[]) ?? []),
      ])).filter((a) => a !== target.display_name);

      const sourceLastMentioned = source.last_mentioned_at as string | null;
      const targetLastMentioned = target.last_mentioned_at as string | null;
      const lastMentionedAt = sourceLastMentioned && targetLastMentioned
        ? (sourceLastMentioned > targetLastMentioned ? sourceLastMentioned : targetLastMentioned)
        : (targetLastMentioned ?? sourceLastMentioned);

      await serviceSupabase.from('people').update({
        aliases: mergedAliases,
        mention_count: ((target.mention_count as number) ?? 0) + ((source.mention_count as number) ?? 0),
        last_mentioned_at: lastMentionedAt,
      }).eq('id', target_id);

      await serviceSupabase.from('people').delete().eq('id', source_id);

      return jsonResponse({ ok: true });
    }

    // Delete all memory for the user (memory_items, people, entry_insights)
    if (action === 'delete_all') {
      await Promise.all([
        serviceSupabase.from('memory_items').delete().eq('user_id', user.id),
        serviceSupabase.from('people').delete().eq('user_id', user.id),
        serviceSupabase.from('entry_insights').delete().eq('user_id', user.id),
      ]);
      return jsonResponse({ ok: true });
    }

    return errorResponse('Unknown action', 400);
  } catch (err) {
    console.error('memory error:', err);
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
