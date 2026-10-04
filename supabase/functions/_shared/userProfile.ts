// Builds the "About the user" block for the reply prompt.
// Plain TS (no Deno APIs) so evals/run.ts can import it too.
// Only the nickname and a birthday flag are sent to the model — never the birth date itself.

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** True when entryDate (YYYY-MM-DD) is the user's birthday. Feb 29 birthdays fall on Feb 28 in non-leap years. */
export function isBirthday(birthDate: string | null | undefined, entryDate: string): boolean {
  if (!birthDate) return false;
  const [, bm, bd] = birthDate.split('-').map(Number);
  const [ey, em, ed] = entryDate.split('-').map(Number);
  if (bm === 2 && bd === 29 && !isLeapYear(ey)) return em === 2 && ed === 28;
  return bm === em && bd === ed;
}

/** Strip anything that could break out of the quoted value in the prompt. */
function sanitizeNickname(nickname: string): string {
  return nickname.replace(/[\r\n"`]/g, '').trim().slice(0, 20);
}

export function buildUserNote(opts: {
  nickname?: string | null;
  birthDate?: string | null;
  entryDate: string;
}): string[] {
  const lines: string[] = [];
  const nickname = opts.nickname ? sanitizeNickname(opts.nickname) : '';
  if (nickname) lines.push(`Nickname: "${nickname}" — address them as "${nickname}님".`);
  if (isBirthday(opts.birthDate, opts.entryDate)) {
    lines.push('Today (the date of this entry) is their birthday — add a short, warm birthday wish.');
  }
  return lines.length ? ['## About the user', ...lines, ''] : [];
}
