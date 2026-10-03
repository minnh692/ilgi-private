# Build the MVP: AI Diary App (Korean, iOS-first)

You are building the MVP of a Korean-language AI diary app. Users write diary entries. For each entry, an AI writes a warm, specific reply: empathy plus one small, useful perspective. The AI remembers the user across entries and gradually surfaces patterns in their emotions, habits, and relationships. Read this whole spec before writing any code.

---

## 0. How to work

- Before coding, save this spec to `docs/SPEC.md`. Create a concise `CLAUDE.md` covering the stack, commands, key decisions, and conventions.
- Work phase by phase (Section 9). At the end of each phase:
  - run typecheck, lint, and tests, and fix the errors;
  - commit with a clear message;
  - give me a short summary: what works, what I should test on my device, and what's next.
- Only stop to ask me for things only I can do: accounts, projects, API keys, Apple Developer / App Store Connect settings, and in-app purchase products. Batch these into one checklist rather than asking one at a time.
- Library APIs change, so check current official docs instead of relying on memory. This applies to:
  - Expo SDK (latest stable) and Expo Router
  - supabase-js: anonymous sign-in, identity linking, `signInWithIdToken`
  - expo-apple-authentication
  - react-native-purchases (RevenueCat)
  - Anthropic Messages API: current model IDs, prompt caching, structured output / tool use
- **My machine is Windows and I have no Mac.**
  - iOS builds must go through EAS Build (cloud) and run as a development build on my physical iPhone.
  - Native-only features won't work in Expo Go: Apple sign-in, RevenueCat, local authentication. Provide mocks for these so the rest of the app can be tested in Expo Go.
- All user-facing copy is Korean (natural 해요체). Code, comments, and commit messages are in English.
- Keep it simple. Use few dependencies and few moving parts, and don't abstract beyond what this spec asks for.

---

## 1. Product principles (do not violate)

1. **Value before signup.** Users write their first entry and get a reply before they are asked to create an account.
2. **The first reply is make-or-break.** It must feel specific to what the user wrote, never generic.
3. **The differentiator is accumulated memory leading to pattern discovery.** An example is "지난 3주 동안 일요일 밤마다 불안이 올라갔어요." Generic comfort is not the differentiator: ChatGPT can give comfort, but it can't find patterns like this unless the user pastes in their history.
4. **Users control memory.** They can see, edit, and delete everything the AI remembers about them.
5. **This is not a medical service.** Never diagnose, label, or "treat." Position the app as self-reflection and wellness.
6. **Safety first.** An entry that suggests self-harm or a crisis gets a safety response, not a normal reply.

---

## 2. Tech stack

- **App:** Expo (latest stable SDK), React Native, TypeScript (strict), Expo Router.
  - Server state: TanStack Query. Use Zustand only if local UI state really needs it.
  - Font: Pretendard.
- **Backend:** Supabase: Auth, Postgres with RLS, and Edge Functions (TypeScript/Deno).
  - Use a hosted Supabase dev project so local Docker isn't required.
  - All schema changes are SQL migrations in `supabase/migrations`.
- **AI:** Anthropic Claude, called **only from Edge Functions**. The API key never ships in the app.
  - Model IDs live in env vars:
    - `MODEL_PLUS` = latest Sonnet, for paid replies and reports
    - `MODEL_FREE` = latest Haiku, for free replies
    - `MODEL_UTILITY` = latest Haiku, for the safety check, insight extraction, and memory updates
  - Use prompt caching on the static system-prompt prefix.
  - Log token usage for every call.
- **Payments:** RevenueCat (`react-native-purchases`), plus a webhook Edge Function that sets the user's plan.
  - `EXPO_PUBLIC_MOCK_PURCHASES=true` enables a fake purchase flow for development.
- **Auth:** On first launch, sign the user in anonymously with Supabase. Later, link Sign in with Apple and keep the same user id and data.
  - If current supabase-js doesn't support linking an identity from a native ID token, implement a server-side `claim-anonymous-data` function that moves the anonymous user's data to the Apple user.
- **No embeddings or vector DB in the MVP.** Retrieval uses structured insights (people, topics, emotions) plus recency.
  - Keep retrieval behind one function, `buildContext`, so pgvector can be added later.

---

## 3. Plans & limits (enforce server-side; never trust the client)

| | Free | Plus |
|---|---|---|
| Diary entries & storage | Unlimited | Unlimited |
| AI replies | 3 per rolling 7 days, `MODEL_FREE` | Unlimited, with a fair-use cap of 10/day, `MODEL_PLUS` |
| Memory used when replying | Last 7 days only | Full history + people tracking |
| "AI가 본 나" memory screen | View / edit / delete (always free — it's the user's data) | Same |
| Weekly report | One-line emotional summary | Full weekly + monthly pattern reports |
| Pattern cards | Locked teaser: "패턴 N개 발견" | Unlocked |
| Face ID lock, export, reminders | Free | Free |

- Prices come from RevenueCat offerings. Target: ₩7,900/month and ₩59,000/year, with a 7-day free trial. Never hardcode prices in the UI.
- Memory processing (insight extraction, people, memory items) runs for free users too, for entries in `remember` mode. That way, upgrading immediately unlocks the full history. Free replies just get a 7-day context window.

---

## 4. Per-entry memory modes

Each entry has a `memory_mode`. The user picks it in the editor with a 3-option segmented control. It defaults to the user's setting, which is `remember` unless changed.

| Mode | Label | Behavior |
|---|---|---|
| `remember` | 기억하고 답장 | The AI replies, and the entry feeds memory (insights, people, patterns). |
| `reply_only` | 답장만 (기억 안 함) | The AI replies using existing memory, but this entry is never extracted, never stored in memory, and never retrieved later. |
| `private` | 나만 보기 | Never sent to the AI. No reply. |

- Show a one-line explanation of the selected mode under the control.
- Users can change the mode after writing. Switching an entry away from `remember` deletes its insights and removes its id from memory-item evidence.
- If the user hasn't given AI consent, only `private` is available.

---

## 5. Screens & flow

### 5.1 First launch (target: under 2 minutes from launch to first reply)

1. **Welcome + consent** (one screen).
   - Explain what the app does.
   - Say "답장은 AI가 써요." This AI disclosure is required by Korea's AI Basic Act.
   - Say "의료 서비스가 아니에요."
   - Show these consents as separate checkboxes, not pre-checked:
     - 민감정보(감정·심리 관련 내용) 처리 동의
     - 일기 내용을 AI 답장 생성을 위해 Anthropic(미국)에 전송하는 것에 동의 — this covers third-party AI sharing (Apple guideline 5.1.2(i)) and overseas transfer (Korean PIPA).
   - Also offer "동의하지 않고 시작," which starts a plain diary mode where only `private` is available.
   - Store consent timestamps.
2. **Silent anonymous sign-in.**
3. **First entry.**
   - Show a guided question at the top, e.g. "오늘 가장 마음에 남은 일은 뭐였어요?"
   - Show 3 tappable prompt chips.
   - Show a soft hint (not a hard block) suggesting at least a couple of sentences.
4. **Reply screen.**
   - Show the reply as a letter-style card labeled "AI가 쓴 답장."
   - While the reply is generating, show a calm "답장을 쓰고 있어요" state.
   - Stream the text if `expo/fetch` streaming works reliably. Otherwise use a non-streaming request; don't sink time into streaming.
   - **For the first entry only** (and only in `remember` mode), append a "기억해둘게요" block that lists 2 concrete things the AI will remember from the entry.
   - Add 👍/👎 feedback buttons ("도움이 됐어요" / "별로예요").
5. **Save prompt:** "이 기록을 잃지 않으려면 계정을 연결하세요" with Sign in with Apple.
   - It is skippable ("나중에").
   - Nudge again after the 3rd entry, and keep the option in Settings.
6. **Paywall** (Day 0, after the first reply).
   - Pitch a 7-day free trial, focused on memory and patterns.
   - Include a clear close button.
   - Never block the core diary.
7. **Home.** Show at most 2 just-in-time coach marks: the write button, and the memory-mode control the next time the user writes. Do not build a multi-step tutorial.

### 5.2 Main screens

Tab bar: **일기 / 인사이트 / 나**

- **일기 (timeline)**
  - Entries grouped by date, each with a mood dot, a reply indicator, and a memory-mode icon.
  - A floating write button.
  - An empty state that includes a writing prompt.
- **Write**
  - A large, distraction-free editor with prompt chips.
  - An optional 5-step mood picker.
  - The memory-mode control.
  - Local draft autosave that survives the app being killed.
- **Entry detail**
  - The entry plus its reply card.
  - Edit or delete the entry.
  - Change its memory mode.
  - Regenerate the reply (counts against the quota).
- **인사이트**
  - A weekly report card.
  - Pattern cards (locked for free users, with a count teaser).
  - A simple 30-day mood trend.
- **나 ("AI가 본 나")**
  - Memory items grouped as: 자주 등장하는 주제 / 중요한 사람들 / 가치·목표 / 도움이 됐던 것 / 힘들어지는 상황.
  - Each item shows its evidence as date chips and offers edit, "이건 아니에요" (dismiss), and delete.
  - A people list with relation and aliases. Users can edit people and merge two of them.
  - A "모든 기억 삭제" button.
- **Settings** (opened from the 나 tab)
  - Account: link Apple, sign out.
  - Default memory mode.
  - Plan and restore purchases.
  - Daily reminder: time picker, local notification.
  - Face ID / passcode lock (expo-local-authentication).
  - Export all entries as JSON + plain text through the share sheet.
  - **Delete account**, in-app, deleting everything (Apple 5.1.1(v)).
  - Privacy policy and terms (placeholder URLs in config).
  - Crisis resources.
  - Disclaimer.
- **Upgrade entry points:** contextual only.
  - The quota-reached sheet.
  - Locked pattern cards.
  - A small "Plus" chip in the 인사이트 header.
  - No persistent banners.

### 5.3 Visual direction

Calm, warm, paper-like, with generous whitespace. The reply should feel like a handwritten letter, not a chat bubble. Support light and dark mode, Dynamic Type, and VoiceOver labels.

---

## 6. AI behavior (this is the product — spend real effort here)

### 6.1 Reply prompt

- Write the system prompt in English. The output is natural Korean in 해요체.
- Store prompts as versioned files in `supabase/functions/_shared/prompts/` (e.g. `reply.v1.md`). Record the prompt version on every reply.

**Reply structure.** It should read like a letter, without headers:

1. **Empathy that mirrors concrete details** from the entry: names, events, and words the user used.
   - Never open with a stock line like "힘드셨겠어요" or "정말 고생 많으셨어요."
2. **Observation or connection.** When memory is relevant, connect to it gently, e.g. "지난주 화요일에도 팀장님 얘기를 하셨는데…".
   - Only reference memory when it genuinely helps. Never show off memory.
   - Never mention anything from `reply_only` or `private` entries.
3. **One small helpful thing,** drawn from the frameworks in 6.2: a reframe, a perspective, or a tiny action. One thing, not a list.
4. **Optionally, one gentle reflective question.**

**Length and tone**

- About 250–600 Korean characters. Shorter entries get shorter replies.
- Match the user's energy: a happy entry gets shared joy, not advice.
- A one-line entry gets a short reply that invites more without pressure.

**Hard rules**

- No diagnoses or clinical labels (우울증, 불안장애, 회피형, 나르시시스트, etc.).
- No medication or medical advice.
- No moralizing and no toxic positivity.
- No multi-item advice lists.
- Never claim to be human or a therapist.
- Don't judge people in the user's life. Focus on the user's feelings and needs.

**Anti-repetition.** Pass in the first sentence of each of the last 3 replies, and instruct the model not to reuse their openings or structure.

### 6.2 Frameworks

Create `supabase/functions/_shared/prompts/frameworks.md`: short, practitioner-style guides written in our own words (no copied book text). Include it in the cached system prefix.

- **CBT:** the thought → feeling → behavior chain, and common thinking traps (all-or-nothing, mind reading, catastrophizing, should-statements). Name these gently in plain language, never as labels on the person.
- **ACT:** values, accepting feelings, small committed actions.
- **Self-compassion:** treating yourself the way you'd treat a friend; common humanity.
- **Nonviolent Communication (for relationships):** the feelings and needs behind a conflict; requests vs. demands.
- **Behavioral activation & tiny habits (for self-development):** the smallest next step; environment design.
- **Strengths & savoring:** for positive entries.

### 6.3 Safety (runs before every reply)

- **Two stages:**
  1. A fast keyword pre-check against a Korean crisis-term list in `_shared/safety/keywords.ts`.
  2. A `MODEL_UTILITY` classifier with structured output: `{ risk: "none" | "elevated" | "crisis", reason }`.
- **`crisis`:** do NOT generate a normal reply. Return a safety response instead: a brief, warm acknowledgement plus a resources card with tap-to-call:
  - 자살예방상담전화 109
  - 정신건강위기상담 1577-0199
  - 긴급 112 / 119
  - Put these in `config/crisisResources.ts`, with a TODO to verify they are current before launch.
- **`elevated`:** a normal reply in a gentler tone, with a soft mention of resources at the end.
- Set `safety_flag` on the entry.
- Never write crisis content into memory items.

### 6.4 Insight extraction & memory update

This runs asynchronously after the reply is saved, and only for `remember` mode. Use `EdgeRuntime.waitUntil` (or equivalent) so the user never waits on it.

1. **Extract** with `MODEL_UTILITY` and structured output into `entry_insights`:
   - a 1–2 sentence summary
   - emotions, each with an intensity from 1 to 5
   - people (the name or nickname as written, plus a guessed relation)
   - topics
   - notable events
   - coping actions the user mentioned
2. **Resolve people** against existing `people` rows (display name + aliases).
   - Create new people conservatively.
   - Never auto-merge without strong evidence; the user can merge manually.
3. **Merge memory** with `MODEL_UTILITY` and structured output. Input: the current active memory items plus the new insights. Output: a list of create / update / no-op operations. Rules:
   - A pattern needs evidence from at least 2 entries.
   - Every item cites its evidence entry ids.
   - Wording is neutral and non-diagnostic.
   - Never change the content of items with status `user_edited`.
   - Never recreate items with status `dismissed`.
   - Keep at most 40 active items; when over the cap, merge items or drop the lowest-confidence ones.
4. **Clean up on delete or mode change.** When an entry is deleted or leaves `remember` mode:
   - delete its insights;
   - remove its id from evidence;
   - delete any items left with no evidence.

### 6.5 Context builder: `buildContext(userId, entry, plan)`

- **Always:** the top 20 active memory items by confidence and recency, plus the people mentioned in today's entry, with their notes.
- **Free:** summaries of `remember`-mode entries from the last 7 days only.
- **Plus:**
  - the last 5 entry summaries;
  - up to 5 older summaries that share people or topics with today's entry;
  - the latest weekly report summary.
- Never include content from `reply_only` or `private` entries, except the current entry being replied to.
- Keep the context under about 8k tokens, and log its size.

### 6.6 Reports

- Generate a report on demand when the 인사이트 tab opens and the latest report for that period is stale. Cache it in `reports`.
- **Weekly (Plus):**
  - emotional arc
  - recurring themes
  - the people who came up
  - what helped
  - one gentle suggestion for next week
- **Free users:**
  - Show a one-line summary plus the number of detected patterns.
  - Compute and store the patterns anyway.
  - **Do not send locked content to the client.**
- **Monthly (Plus):** the same as weekly at month scale, plus a comparison with the previous month.

---

## 7. Data model (Postgres)

**RLS on every table:** users can access only their own rows. AI-generated writes go through Edge Functions using the service role.

| Table | Columns |
|---|---|
| `profiles` | `id` (= `auth.users.id`), `plan` (`'free'` \| `'plus'`), `plan_expires_at`, `default_memory_mode`, `consent_ai_at`, `consent_sensitive_at`, `consent_overseas_at`, `timezone`, `reminder_time`, `onboarding_state jsonb`, `created_at` |
| `entries` | `id`, `user_id`, `entry_date`, `content`, `mood smallint null`, `memory_mode`, `prompt_used`, `safety_flag`, `created_at`, `updated_at` |
| `replies` | `id`, `entry_id`, `user_id`, `content`, `kind` (`'normal'` \| `'safety'`), `model`, `prompt_version`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `rating smallint null`, `created_at` |
| `entry_insights` | `entry_id` (pk), `user_id`, `summary`, `emotions jsonb`, `people text[]`, `topics text[]`, `events text[]`, `coping text[]`, `created_at` |
| `people` | `id`, `user_id`, `display_name`, `aliases text[]`, `relation`, `notes`, `mention_count`, `last_mentioned_at` |
| `memory_items` | `id`, `user_id`, `category` (`'theme'` \| `'person_pattern'` \| `'value_goal'` \| `'what_helps'` \| `'trigger'` \| `'preference'`), `content`, `evidence_entry_ids uuid[]`, `confidence real`, `status` (`'active'` \| `'user_edited'` \| `'dismissed'`), `created_at`, `updated_at` |
| `reports` | `id`, `user_id`, `kind` (`'weekly'` \| `'monthly'`), `period_start`, `period_end`, `content jsonb`, `created_at` |
| `usage_events` | `id`, `user_id`, `kind` (`'reply'` \| `'safety'` \| `'extract'` \| `'memory'` \| `'report'`), `model`, `input_tokens`, `output_tokens`, `created_at` — used for quotas and cost tracking |

Also add a SQL view (or a documented query) showing LLM cost per user over the last 30 days, so I can monitor unit economics.

---

## 8. Edge Functions

| Function | What it does |
|---|---|
| `generate-reply` | Auth → consent check → quota check → safety check → `buildContext` → Claude call → save reply + usage → kick off async processing. When the quota is exceeded, return a typed error that the app turns into the upgrade sheet. |
| `process-entry` | Extraction, people resolution, and memory merge. Also callable for reprocessing. |
| `generate-report` | Weekly and monthly reports. |
| `memory` | List, update, dismiss, and delete items; merge people; delete all memory. |
| `revenuecat-webhook` | Verify the auth header, then update `plan` / `plan_expires_at`. |
| `delete-account` | Delete all of the user's data and the auth user. |
| `claim-anonymous-data` | Only if needed (see Auth in Section 2). |

Shared code:

- an Anthropic client wrapper with retries and timeouts
- a prompt loader
- zod schemas
- a quota helper
- structured logging — **never log diary content**

---

## 9. Phases (do them in order)

1. **Scaffold.**
   - Expo app with Router tabs.
   - Design tokens: light/dark, a warm paper-like palette, Pretendard.
   - Supabase client and `.env.example`.
   - Migrations and RLS.
   - `CLAUDE.md` and `docs/SPEC.md`.
2. **Auth & consent.**
   - Anonymous sign-in.
   - The welcome/consent screen.
   - Profiles.
   - Apple sign-in linking, mocked in Expo Go.
3. **Diary core.**
   - Write screen: prompt chips, mood, memory mode, local draft autosave.
   - Timeline and entry detail.
   - Edit and delete.
4. **AI reply.**
   - `generate-reply`, prompts v1, and frameworks.
   - The safety flow.
   - The reply card and rating.
   - The first-entry "기억해둘게요" block.
   - Quotas and the upgrade sheet.
5. **Memory.**
   - `process-entry` and people resolution.
   - Memory merge.
   - `buildContext` for free and Plus.
   - The "AI가 본 나" screen with edit, dismiss, delete, and merge.
6. **Monetization.**
   - RevenueCat with mock mode.
   - The paywall after the first reply.
   - Restore purchases.
   - The webhook and plan gating.
7. **Insights.**
   - Reports.
   - Pattern teasers.
   - The mood trend.
8. **Settings & compliance.**
   - Reminders and Face ID lock.
   - Export.
   - Delete memory and delete account.
   - Disclaimer and crisis resources.
   - Privacy and terms placeholders.
9. **Evals & polish.**
   - The evals in Section 10.
   - Empty, error, and offline states.
   - A full Korean copy pass.
   - An accessibility pass.

---

## 10. Evals (prompt quality is the product — don't skip)

- **Test entries** in `evals/entries/*.json`: 30 synthetic Korean entries.
  - Situations to cover:
    - work stress
    - job-search anxiety
    - a breakup
    - conflict with a friend
    - conflict with family
    - a small win
    - a boring day
    - a one-liner
    - a very long rant
    - angry venting about a person
    - self-criticism
    - procrastination
    - a happy day
    - Korean mixed with English
  - 3 crisis-adjacent cases, one of which is a clear crisis.
  - 3 multi-entry sequences, to test how replies reference memory.
- **Runner:** `evals/run.ts` runs the real reply pipeline (same prompts, same context builder, fixture memory) against the API. It writes `evals/out/<timestamp>.md` so I can review the replies side by side.
- **Automated checks:**
  - banned phrases and labels
  - length bounds
  - a generic-opening detector
  - every crisis case produces a safety response
  - `reply_only` / `private` content never appears in later replies
- **Command:** `npm run eval`. Share results with me after Phase 4 and after Phase 5.

---

## 11. Out of scope for the MVP

Don't build these, but leave clean extension points:

- Android store release (keep the code cross-platform, though)
- follow-up chat on replies
- guided multi-week programs
- voice entries and images
- Instagram share cards
- a web app
- push campaigns beyond the daily reminder
- embeddings / pgvector

---

## 12. Definition of done

On my iPhone, in an EAS development build, this whole flow works:

1. Fresh install → consent → first entry → a specific reply with the "기억해둘게요" block, all in under 2 minutes.
2. Link Apple.
3. Paywall (mock or sandbox).
4. Write 5 entries across several days. Later replies reference earlier entries appropriately.
5. "AI가 본 나" shows memory that I can edit.
6. Using up the free quota triggers the upgrade sheet.
7. Plus unlocks patterns and reports.
8. Delete account wipes everything.

Also:

- Typecheck, lint, and evals all pass.
- `CLAUDE.md` lists every command and every account-side setup step:
  - Apple Developer Program
  - Expo/EAS
  - Supabase
  - Anthropic API key
  - RevenueCat + App Store Connect subscription products
