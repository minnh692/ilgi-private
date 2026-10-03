import Anthropic from 'npm:@anthropic-ai/sdk@0.30.0';

const MODEL_PLUS = Deno.env.get('MODEL_PLUS') ?? 'claude-sonnet-4-6';
const MODEL_FREE = Deno.env.get('MODEL_FREE') ?? 'claude-haiku-4-5-20251001';
const MODEL_UTILITY = Deno.env.get('MODEL_UTILITY') ?? 'claude-haiku-4-5-20251001';

export { MODEL_PLUS, MODEL_FREE, MODEL_UTILITY };

export function getClient() {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  return new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
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
