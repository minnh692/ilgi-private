import { createClient } from 'npm:@supabase/supabase-js@2';

// RevenueCat → Supabase subscription sync.
//
// Auth: RevenueCat sends the "Authorization header value" configured in its dashboard; we require
// it on every request (fail closed). This function is deployed with verify_jwt = false (see
// supabase/config.toml) because RevenueCat can't send a Supabase JWT.
//
// State: we don't interpret individual events (CANCELLATION keeps access until expiry, TRANSFER
// moves it between users, billing issues have grace periods, ...). Per RevenueCat's recommendation
// we re-fetch each affected user's current state from GET /v1/subscribers and store that.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_AUTH = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');        // dashboard "Authorization header value"
const REVENUECAT_SECRET_KEY = Deno.env.get('REVENUECAT_SECRET_API_KEY'); // RevenueCat secret API key (sk_...)
const ENTITLEMENT_ID = 'plus';

// Supabase user ids are UUIDs; anything else (e.g. RevenueCat anonymous ids) isn't one of our users
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RevenueCatEvent {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  transferred_from?: string[];
  transferred_to?: string[];
}

interface Entitlement {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Current plan for one app user, straight from RevenueCat. */
async function fetchPlan(appUserId: string): Promise<{ plan: 'free' | 'plus'; expiresAt: string | null }> {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${REVENUECAT_SECRET_KEY}` },
  });
  if (!res.ok) throw new Error(`RevenueCat subscribers ${res.status}`);
  const body = await res.json() as { subscriber?: { entitlements?: Record<string, Entitlement> } };
  const ent = body.subscriber?.entitlements?.[ENTITLEMENT_ID];
  if (!ent) return { plan: 'free', expiresAt: null };

  // null expiry = non-expiring entitlement; otherwise active until expiry or end of grace period
  if (ent.expires_date === null) return { plan: 'plus', expiresAt: null };
  const ends = [ent.expires_date, ent.grace_period_expires_date]
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime());
  const until = Math.max(...ends);
  return until > Date.now()
    ? { plan: 'plus', expiresAt: new Date(until).toISOString() }
    : { plan: 'free', expiresAt: null };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  if (!WEBHOOK_AUTH || !REVENUECAT_SECRET_KEY) {
    console.error(JSON.stringify({ fn: 'revenuecat-webhook', error: 'not configured' }));
    return new Response('Not configured', { status: 500 });
  }
  const auth = req.headers.get('Authorization') ?? '';
  if (!timingSafeEqual(auth, WEBHOOK_AUTH)) return new Response('Unauthorized', { status: 401 });

  let event: RevenueCatEvent | undefined;
  try {
    event = (await req.json() as { event?: RevenueCatEvent }).event;
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (!event || event.type === 'TEST') return new Response('OK', { status: 200 });

  const userIds = [...new Set([
    event.app_user_id,
    event.original_app_user_id,
    ...(event.transferred_from ?? []),
    ...(event.transferred_to ?? []),
  ])].filter((id): id is string => !!id && UUID_RE.test(id));

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  try {
    for (const id of userIds) {
      const { plan, expiresAt } = await fetchPlan(id);
      const { error } = await supabase
        .from('profiles')
        .update({ plan, plan_expires_at: expiresAt })
        .eq('id', id);
      if (error) throw error;
    }
  } catch (e) {
    // Non-200 makes RevenueCat retry (5, 10, 20, 40, 80 min)
    console.error(JSON.stringify({ fn: 'revenuecat-webhook', type: event.type, error: (e as Error).message }));
    return new Response('Retry', { status: 500 });
  }

  console.log(JSON.stringify({ fn: 'revenuecat-webhook', type: event.type, users: userIds.length }));
  return new Response('OK', { status: 200 });
});
