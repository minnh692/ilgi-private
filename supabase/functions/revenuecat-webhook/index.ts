import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHmac } from 'node:crypto';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REVENUECAT_WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')!;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = await req.text();

  // Verify RevenueCat webhook signature
  const signature = req.headers.get('X-RevenueCat-Signature');
  if (REVENUECAT_WEBHOOK_SECRET && signature) {
    const expected = createHmac('sha256', REVENUECAT_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');
    if (signature !== expected) {
      return new Response('Invalid signature', { status: 401 });
    }
  }

  const event = JSON.parse(body);
  const serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const eventType = event.event?.type;
  const appUserId = event.event?.app_user_id;

  if (!appUserId) return new Response('OK', { status: 200 });

  if (['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION'].includes(eventType)) {
    const expiresAt = event.event?.expiration_at_ms
      ? new Date(event.event.expiration_at_ms).toISOString()
      : null;

    await serviceSupabase
      .from('profiles')
      .update({ plan: 'plus', plan_expires_at: expiresAt })
      .eq('id', appUserId);

  } else if (['CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE'].includes(eventType)) {
    await serviceSupabase
      .from('profiles')
      .update({ plan: 'free', plan_expires_at: null })
      .eq('id', appUserId);
  }

  return new Response('OK', { status: 200 });
});
