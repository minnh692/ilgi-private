import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { ProfileRow } from '@/types/database';

// Loads the profile for the current user and keeps the auth store in sync.
// Called once from the root layout so all screens can read profile from the store.
export function useProfile() {
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .maybeSingle();

      if (cancelled) return;

      if (data) {
        setProfile(data as ProfileRow);
      } else {
        // Anonymous user with no profile yet — create a minimal one
        const { data: created } = await supabase
          .from('profiles')
          .insert({
            id: user!.id,
            plan: 'free',
            default_memory_mode: 'private',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            onboarding_state: {},
          })
          .select()
          .maybeSingle();

        if (!cancelled && created) setProfile(created as ProfileRow);
      }

      setLoading(false);
    }

    load().catch(console.error);
    return () => { cancelled = true; };
  }, [user?.id, setProfile, setLoading]);
}
