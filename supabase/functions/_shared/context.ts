import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

interface ContextOptions {
  userId: string;
  entryId: string;
  entryContent: string;
  plan: 'free' | 'plus';
  supabase: SupabaseClient;
}

interface BuiltContext {
  memoryItems: string;
  recentEntries: string;
  tokenEstimate: number;
}

// buildContext is the single retrieval function — pgvector can be added here later
export async function buildContext(opts: ContextOptions): Promise<BuiltContext> {
  const { userId, entryId, entryContent, plan, supabase } = opts;

  // Top 20 memory items (active + user_edited) by confidence
  const { data: memoryItems } = await supabase
    .from('memory_items')
    .select('category, content')
    .eq('user_id', userId)
    .in('status', ['active', 'user_edited'])
    .order('confidence', { ascending: false })
    .limit(20);

  const memoryStr = memoryItems?.length
    ? memoryItems.map((m) => `[${m.category}] ${m.content}`).join('\n')
    : '(no memory yet)';

  // People mentioned in today's entry (by scanning known names against entry text)
  const { data: allPeople } = await supabase
    .from('people')
    .select('display_name, aliases, relation, notes')
    .eq('user_id', userId)
    .not('notes', 'is', null);

  const mentionedPeople = (allPeople ?? []).filter((p) => {
    const names = [p.display_name, ...((p.aliases as string[]) ?? [])];
    return names.some((name) => name.length >= 2 && entryContent.includes(name));
  });

  const peopleStr = mentionedPeople.length
    ? '\n\n## People in this entry\n' + mentionedPeople
        .map((p) => `${p.display_name}${p.relation ? ` (${p.relation})` : ''}: ${p.notes}`)
        .join('\n')
    : '';

  // Recent entry summaries
  let summaries: string[] = [];
  if (plan === 'plus') {
    const { data: recent } = await supabase
      .from('entry_insights')
      .select('summary, created_at')
      .eq('user_id', userId)
      .neq('entry_id', entryId)
      .order('created_at', { ascending: false })
      .limit(10);
    summaries = recent?.map((r) => r.summary) ?? [];
  } else {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('entry_insights')
      .select('summary, created_at')
      .eq('user_id', userId)
      .neq('entry_id', entryId)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(7);
    summaries = recent?.map((r) => r.summary) ?? [];
  }

  const recentStr = summaries.length ? summaries.join('\n---\n') : '(no prior entries)';

  const fullMemory = memoryStr + peopleStr;
  const tokenEstimate = Math.ceil((fullMemory.length + recentStr.length) / 4);

  return {
    memoryItems: fullMemory,
    recentEntries: recentStr,
    tokenEstimate,
  };
}
