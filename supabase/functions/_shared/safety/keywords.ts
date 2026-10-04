// Korean crisis keyword pre-check (fast, runs before LLM safety classifier)
// TODO: Review and expand with mental health professionals before launch

export const CRISIS_KEYWORDS = [
  // Self-harm / suicide
  '자살', '자해', '죽고 싶', '죽고싶', '살고 싶지 않', '살기 싫',
  '목숨을 끊', '스스로 목숨', '죽어버리', '죽어버릴',
  '극단적 선택', '극단적선택',
  '손목을 긋', '약을 많이',
  // Severe distress signals
  '더 이상 살', '살 이유가 없', '사라지고 싶', '없어지고 싶',
  // Crisis resources search intent
  '자살 방법', '자해 방법',
];

export const ELEVATED_KEYWORDS = [
  '힘들어 죽겠', '미칠 것 같', '버티기 힘',
  '아무도 없', '도망가고 싶',
  '포기하고 싶', '모든 걸 포기',
  '아무 의미 없', '무의미',
];

// Matched against the raw text: with spaces removed, "나 혼자 다 치웠다" would contain "혼자다".
// Not followed by another syllable, so "혼자 다니다" / "혼자다니" don't match either.
export const ELEVATED_PATTERNS = [/혼자다(?![가-힣])/];

export function preCheck(text: string): 'crisis' | 'elevated' | 'none' {
  const normalized = text.replace(/\s+/g, '');
  for (const kw of CRISIS_KEYWORDS) {
    if (normalized.includes(kw.replace(/\s+/g, ''))) return 'crisis';
  }
  for (const kw of ELEVATED_KEYWORDS) {
    if (normalized.includes(kw.replace(/\s+/g, ''))) return 'elevated';
  }
  for (const pattern of ELEVATED_PATTERNS) {
    if (pattern.test(text)) return 'elevated';
  }
  return 'none';
}
