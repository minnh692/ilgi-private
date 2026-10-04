// Parses JSON from a model response, tolerating ```json fences and surrounding prose.
export function parseModelJson<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body) as T;
  } catch {
    // Fall back to the outermost object/array in the text
    const start = body.search(/[[{]/);
    const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
    if (start === -1 || end <= start) throw new Error('no JSON found in model output');
    return JSON.parse(body.slice(start, end + 1)) as T;
  }
}
