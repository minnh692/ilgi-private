import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Untyped client (no generated DB types in Edge Functions)
type Client = SupabaseClient;

// Limits are enforced atomically in Postgres: see reserve_reply_slot() in
// migrations/005_reply_quota_reservation.sql (free = 3 / rolling 7 days, plus = 10 / local day).

/** Reserves one reply slot. Returns the reservation id, or null when the quota is used up. */
export async function reserveReplySlot(
  supabase: Client,
  userId: string,
  plan: 'free' | 'plus',
  timezone: string | null,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('reserve_reply_slot', {
    p_user_id: userId,
    p_plan: plan,
    p_timezone: timezone,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Records the actual model/token usage on a reservation once the reply is saved. */
export async function finalizeReplySlot(
  supabase: Client,
  slotId: string,
  usage: { model: string; input_tokens: number; output_tokens: number },
): Promise<void> {
  const { error } = await supabase.from('usage_events').update(usage).eq('id', slotId);
  if (error) console.error(JSON.stringify({ fn: 'quota', op: 'finalize', code: error.code }));
}

/** Gives the slot back (generation failed, or the entry turned out to be a crisis). */
export async function releaseReplySlot(supabase: Client, slotId: string): Promise<void> {
  const { error } = await supabase.from('usage_events').delete().eq('id', slotId);
  if (error) console.error(JSON.stringify({ fn: 'quota', op: 'release', code: error.code }));
}
