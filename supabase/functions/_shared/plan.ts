// Free launch: subscriptions aren't on sale yet, so every account gets the Plus feature set and
// limits, served by the cheap model (see MODEL_PLUS in anthropic.ts). On by default; set the
// FREE_LAUNCH=false secret once paid plans go live. Keep in sync with src/lib/plan.ts.
export const FREE_LAUNCH = Deno.env.get('FREE_LAUNCH') !== 'false';

// Plus only while it hasn't lapsed. plan_expires_at is set by revenuecat-webhook (includes any
// billing grace period); null means no known expiry. Guards against a missed EXPIRATION webhook.
export function effectivePlan(profile: { plan: string; plan_expires_at: string | null }): 'free' | 'plus' {
  if (FREE_LAUNCH) return 'plus';
  if (profile.plan !== 'plus') return 'free';
  if (profile.plan_expires_at && new Date(profile.plan_expires_at).getTime() <= Date.now()) return 'free';
  return 'plus';
}
