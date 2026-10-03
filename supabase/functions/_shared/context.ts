import { createClient } from 'npm:@supabase/supabase-js@2';

interface ContextOptions {
  userId: string;
  entryId: string;
  entryContent: string;
  plan: 'free' | 'plus';
  supabase: ReturnType<typeof createClient>;
}

interface BuiltContext {
  memoryItems: string;
  recentEntries: string;
  tokenEstimate: number;
}

// buildContext is the single retrieval function — pgvector can be added here later
export async function buildContext(opts: ContextOptions): Promise<BuiltContext> {
  const { userId, entryId, entryContent, plan, supabase } = opts;

  // Top 20 memory items by confidence
  const { data: memoryItems } = await supabase
    .from('memory_items')
    .select('category, content, evidence_entry_ids')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('confidence', { ascending: false })
    .limit(20);

  const memoryStr = memoryItems?.length
    ? memoryItems
        .map((m) => `[${m.category}] ${m.content}`)
        .join('\n')
    : '(no memory yet)';

  // Recent entry summaries
  let summaries: string[] = [];
  if (plan === 'plus') {
    // Last 5 + up to 5 topically related
    const { data: recent } = await supabase
      .from('entry_insights')
      .select('entry_id, summary, created_at')
      .eq('user_id', userId)
      .neq('entry_id', entryId)
      .order('created_at', { ascending: false })
      .limit(5);

    summaries = recent?.map((r) => r.summary) ?? [];
  } else {
    // Free: last 7 days only
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('entry_insights')
      .select('entry_id, summary, created_at')
      .eq('user_id', userId)
      .neq('entry_id', entryId)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(7);

    summaries = recent?.map((r) => r.summary) ?? [];
  }

  const recentStr = summaries.length
    ? summaries.join('\n---\n')
    : '(no prior entries)';

  // Rough token estimate (4 chars ≈ 1 token)
  const tokenEstimate = Math.ceil((memoryStr.length + recentStr.length) / 4);

  return {
    memoryItems: memoryStr,
    recentEntries: recentStr,
    tokenEstimate,
  };
}
