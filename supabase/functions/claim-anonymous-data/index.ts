import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Tables that reference user_id and need migrating
const USER_ID_TABLES = [
  'entries',
  'replies',
  'entry_insights',
  'people',
  'memory_items',
  'reports',
  'usage_events',
] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    // Authenticate as the NEW (social login) user
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return errorResponse('Unauthorized', 401);

    const userSupabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user: newUser } } = await userSupabase.auth.getUser();
    if (!newUser) return errorResponse('Unauthorized', 401);

    // Ownership proof: the caller must present the anonymous session's own access token.
    // A bare user id is not enough — otherwise anyone who learned an anonymous id could take its diary.
    const { anonymousAccessToken } = await req.json();
    if (!anonymousAccessToken || typeof anonymousAccessToken !== 'string') {
      return errorResponse('anonymousAccessToken required', 400);
    }

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: { user: anonUser } } = await service.auth.getUser(anonymousAccessToken);
    if (!anonUser) return errorResponse('Invalid anonymous session', 401);
    if (!anonUser.is_anonymous) return errorResponse('Source user is not anonymous', 400);
    const anonymousUserId = anonUser.id;

    // Prevent self-claim
    if (anonymousUserId === newUser.id) {
      return jsonResponse({ skipped: true, reason: 'same user' });
    }

    // Migrate all user_id-linked data to the new user
    for (const table of USER_ID_TABLES) {
      const { error } = await service
        .from(table)
        .update({ user_id: newUser.id } as Record<string, string>)
        .eq('user_id', anonymousUserId);

      if (error) {
        console.error(`Failed to migrate ${table}:`, error);
        // Continue — best-effort migration
      }
    }

    // Migrate profile: upsert for new user (keep existing if present), then delete old
    const { data: oldProfile } = await service
      .from('profiles')
      .select('*')
      .eq('id', anonymousUserId)
      .maybeSingle();

    if (oldProfile) {
      // Only copy profile data if new user has no profile yet
      const { data: existingProfile } = await service
        .from('profiles')
        .select('id')
        .eq('id', newUser.id)
        .maybeSingle();

      if (!existingProfile) {
        await service.from('profiles').insert({
          ...oldProfile,
          id: newUser.id,
        });
      }

      await service.from('profiles').delete().eq('id', anonymousUserId);
    }

    // Delete the anonymous auth user
    await service.auth.admin.deleteUser(anonymousUserId);

    console.log(JSON.stringify({ fn: 'claim-anonymous-data', migrated: true }));
    return jsonResponse({ migrated: true });

  } catch (err) {
    console.error('claim-anonymous-data error:', err);
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
