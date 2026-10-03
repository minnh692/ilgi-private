import { createClient } from 'npm:@supabase/supabase-js@2';

const FREE_REPLIES_PER_7_DAYS = 3;
const PLUS_REPLIES_PER_DAY = 10;

export async function checkQuota(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  plan: 'free' | 'plus'
): Promise<{ allowed: boolean; remaining: number }> {
  const now = new Date();

  if (plan === 'plus') {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('kind', 'reply')
      .gte('created_at', dayStart.toISOString());

    const used = count ?? 0;
    return { allowed: used < PLUS_REPLIES_PER_DAY, remaining: PLUS_REPLIES_PER_DAY - used };
  }

  // Free: rolling 7-day window
  const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const { count } = await supabase
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'reply')
    .gte('created_at', windowStart.toISOString());

  const used = count ?? 0;
  return { allowed: used < FREE_REPLIES_PER_7_DAYS, remaining: FREE_REPLIES_PER_7_DAYS - used };
}
