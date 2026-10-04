import Anthropic from 'npm:@anthropic-ai/sdk@0.30.0';
import { FREE_LAUNCH } from './plan.ts';

const MODEL_FREE = Deno.env.get('MODEL_FREE') ?? 'claude-haiku-4-5-20251001';
// During the free launch everyone is on Plus features, so Plus calls use the cheap model too
const MODEL_PLUS = FREE_LAUNCH ? MODEL_FREE : (Deno.env.get('MODEL_PLUS') ?? 'claude-sonnet-4-6');
const MODEL_UTILITY = Deno.env.get('MODEL_UTILITY') ?? 'claude-haiku-4-5-20251001';

export { MODEL_PLUS, MODEL_FREE, MODEL_UTILITY };

export function getClient() {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  // Keys not scoped to a workspace must name one per request
  const workspaceId = Deno.env.get('ANTHROPIC_WORKSPACE_ID');
  return new Anthropic({
    apiKey,
    // Keep worst case (timeout × (retries + 1) + backoff) well inside the Edge Function wall-clock limit;
    // under load it's better to fail fast with a "busy" message than to hang for minutes
    maxRetries: 1,
    timeout: 30_000,
    defaultHeaders: workspaceId ? { 'anthropic-workspace-id': workspaceId } : undefined,
  });
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
}

export function extractUsage(response: { usage: Anthropic.Usage }): TokenUsage {
  const u = response.usage as Anthropic.Usage & { cache_read_input_tokens?: number };
  return {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
  };
}

/**
 * Maps Anthropic failures to what the app should tell the user:
 *  - 'spend_cap': the org hit its monthly spend cap — no retry helps until the cap is raised
 *  - 'busy':      rate limited (429) or overloaded (529/503) — retry in a moment
 *  - null:        anything else (a real error)
 */
export function classifyAnthropicError(err: unknown): 'spend_cap' | 'busy' | null {
  if (!(err instanceof Anthropic.APIError)) return null;
  const body = err.error as { error?: { details?: { error_code?: string } } } | undefined;
  if (err.status === 429) {
    return body?.error?.details?.error_code === 'enforced_spend_limit_reached' ? 'spend_cap' : 'busy';
  }
  if (err.status === 529 || err.status === 503) return 'busy';
  return null;
}
