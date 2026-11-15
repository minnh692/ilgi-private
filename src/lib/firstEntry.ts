import { router } from 'expo-router';
import { supabase } from './supabase';

/**
 * Leaves onboarding for the diary tab. A user who hasn't written anything yet lands straight in
 * the write screen (stacked on the diary tab) so the first entry is one step away.
 */
export async function enterApp(userId: string): Promise<void> {
  let isFirstEntry = false;
  try {
    const { count, error } = await supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    isFirstEntry = !error && count === 0;
  } catch {
    // Offline or similar: just open the diary
  }

  router.replace('/(tabs)/diary');
  if (isFirstEntry) router.push({ pathname: '/write', params: { first: '1' } });
}
