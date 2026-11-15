# CLAUDE.md — ilgi AI Diary App

## Stack
- **App**: Expo SDK 57, React Native, TypeScript (strict), Expo Router v3 (file-based routing)
- **State**: TanStack Query (server state), Zustand (draft only)
- **Backend**: Supabase (Auth, Postgres + RLS, Edge Functions in Deno)
- **AI**: Anthropic Claude — called only from Edge Functions, never from the app
- **Payments**: RevenueCat (`react-native-purchases`), mocked via `EXPO_PUBLIC_MOCK_PURCHASES=true`
- **Font**: Pretendard (download from https://github.com/orioncactus/pretendard and put in `assets/fonts/`)

## Key commands
```bash
npm start           # Start Expo dev server
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npm run eval        # Run prompt evals (Phase 9)
```

## EAS Build (iOS — required because user has no Mac)
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile development  # First development build
eas build --platform ios --profile preview       # Internal distribution
```

## Supabase
```bash
npm install -g supabase
supabase login
supabase init              # Already done
supabase link --project-ref YOUR_PROJECT_REF
supabase db push           # Apply migrations
supabase functions deploy generate-reply
supabase functions deploy process-entry
supabase functions deploy delete-account
supabase functions deploy revenuecat-webhook
supabase functions deploy claim-anonymous-data
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set MODEL_PLUS=claude-sonnet-4-6
supabase secrets set MODEL_FREE=claude-haiku-4-5-20251001
supabase secrets set MODEL_UTILITY=claude-haiku-4-5-20251001
supabase secrets set REVENUECAT_WEBHOOK_AUTH="Bearer <random>"   # same value as RevenueCat → Webhooks → Authorization header
supabase secrets set REVENUECAT_SECRET_API_KEY=sk_...            # RevenueCat → API keys → secret key
```

## File layout
```
app/               Expo Router screens
  _layout.tsx      Root layout (auth + QueryClient)
  index.tsx        Entry point → redirects to onboarding or tabs
  onboarding.tsx   Consent + anonymous sign-in
  write.tsx        Write entry modal
  entry/[id].tsx   Entry detail + reply
  (tabs)/          Tab bar
    diary.tsx      Timeline
    insights.tsx   Reports + patterns
    profile.tsx    "AI가 본 나" memory screen
src/
  theme/           Design tokens + useTheme hook
  lib/             supabase.ts, queryClient.ts
  stores/          authStore, draftStore (Zustand)
  types/           database.ts (typed Supabase schema)
supabase/
  migrations/      SQL migrations (apply with supabase db push)
  functions/       Edge Functions (Deno)
    generate-reply/
    process-entry/
    delete-account/
    revenuecat-webhook/
    _shared/       anthropic.ts, quota.ts, context.ts, prompts/, safety/
config/
  crisisResources.ts
docs/
  SPEC.md          Full product spec
evals/             Prompt eval runner (Phase 9)
```

## Key decisions
- **Prompt caching**: system prompt is cached with `cache_control: ephemeral` on every Claude call
- **Memory modes**: `remember` | `reply_only` | `private` — enforced server-side
- **Free launch (current)**: no paid plans yet. `FREE_LAUNCH` (server: `_shared/plan.ts`, on unless secret `FREE_LAUNCH=false`; app: `src/lib/plan.ts`) makes `effectivePlan()` return `plus` for everyone — all features + the 10/day limit — while `MODEL_PLUS` falls back to `MODEL_FREE` (Haiku). The settings 구독 section is hidden, `/paywall` only shows a "구독 준비 중" alert, and RevenueCat is not initialized. To launch paid: flip both flags, and in `src/content/legal.ts` restore the paid-service clause (제5조) plus the payment-data and RevenueCat entries in the privacy policy
- **Quota**: free = 3 replies / rolling 7 days; plus = 10/day (user's local day) — reserved atomically by `reserve_reply_slot()` (migration 005) from the Edge Function, released if generation fails; never enforced client-side. Crisis replies bypass quota
- **AI key never ships in app** — all Claude calls go through Edge Functions
- **Login screen first** (`app/login.tsx`): Apple (native, iOS) / Google / Kakao (Supabase OAuth + PKCE in an in-app browser), or "로그인 없이 시작" (anonymous). Anonymous users link later via `/login?mode=link`; their data moves to the social account through `claim-anonymous-data`, which requires the anonymous session's access token as proof of ownership
- **AI is for signed-in accounts only**: anonymous users can write but get no AI replies/memory (`login_required`); crisis responses still go to everyone. Anonymous accounts are free to recreate, so per-account quota alone can't stop abuse
- **Memory processing is self-healing**: `entries.memory_processed_at` (migration 006) marks completed `process-entry` runs; `generate-reply` retries failed/unprocessed entries; editing an entry's text clears it so it's reprocessed
- **Anthropic capacity errors** map to `ai_busy` (429/529) / `ai_unavailable` (monthly spend cap) with 503 so the app can say "try again shortly"
- **No pgvector in MVP** — `buildContext()` in `_shared/context.ts` is the single retrieval function, designed to add vector search later
- **Plan is server-owned**: only `revenuecat-webhook` (service role) writes `profiles.plan` — a trigger (migration 008) pins it for client roles. The webhook requires its Authorization header and re-fetches state from RevenueCat `GET /v1/subscribers` instead of interpreting events. Server code uses `effectivePlan()` so a lapsed `plan_expires_at` counts as free. Subscribing requires a linked account
- **Persona**: the AI is a cat named 무늬 (`reply.v2.md`) — natural 해요체, no cat speech ("냥"), never signs (app renders "— 무늬"); safety/crisis responses drop the persona entirely
- **Tabs**: `app/(tabs)/_layout.tsx` uses `TopTabs` (`expo-router/js-top-tabs`, needs `react-native-tab-view` + native `react-native-pager-view`) at the bottom so tabs swipe; the bar is the floating pill in `src/components/FloatingTabBar.tsx`, which overlays content, so tab screens pad with `useTabBarSpace()`
- **First entry**: after onboarding, `enterApp()` (`src/lib/firstEntry.ts`) opens `/write?first=1` on top of the diary tab when the user has no entries
- **Marketing consent + auto reminder** (migration 009): optional `consent_marketing_at` and separate `consent_marketing_night_at` (21:00–08:00, Korean Network Act art. 50). Reminders are local notifications; with consent and `reminder_auto`, `syncAutoReminder()` (`src/lib/notifications.ts`) schedules 22:00 (20:30 without night consent) and moves to the user's usual writing time once there are 5+ entries in 30 days, computed on-device from `entries.created_at` only. A user-picked fixed time (`reminder_time`) needs no consent. Withdrawal is in settings. Accounts from before the consent existed get a one-time `MarketingConsentPrompt` over the tabs (answer stored in `onboarding_state.marketingPromptedAt`). Legal text lives in `src/content/legal.ts` (`marketing` doc) and must be mirrored by hand in `web/privacy.html`
- **`EdgeRuntime.waitUntil`** used in `generate-reply` to kick off `process-entry` async, so user never waits

## Conventions
- User-facing copy: Korean (자연스러운 해요체)
- Code, comments, commit messages: English
- Prompts versioned as `reply.v1.md` in `_shared/prompts/`
- **Never log diary content**
- Structured logging only

## Account-side setup checklist (things only you can do)
- [ ] **Supabase**: Create project at supabase.com, get URL + anon key + service role key
- [ ] **Anthropic**: Get API key at console.anthropic.com
- [ ] **RevenueCat**: Create app, get iOS public key; create subscription products in App Store Connect
  - Monthly: ₩7,900/month
  - Annual: ₩59,000/year
  - 7-day free trial on both
- [ ] **Apple Developer Program**: Enroll at developer.apple.com (₩129,000/year)
  - Enable Sign in with Apple capability
  - Set bundle ID: `com.munui.app`
- [ ] **Google login**: Google Cloud OAuth client (Web) → Supabase Auth → Providers → Google (client ID + secret)
- [ ] **Kakao login**: Kakao Developers app → Supabase Auth → Providers → Kakao (REST API key + client secret); set 동의항목 (email may require 비즈 앱)
- [ ] **Supabase redirect URL**: add `munui://auth-callback` under Auth → URL Configuration → Redirect URLs
- [ ] **EAS**: `eas login` with your Expo account, `eas build:configure`, set projectId in `app.config.ts`
- [ ] **Pretendard font**: Download from https://github.com/orioncactus/pretendard and place `.otf` files in `assets/fonts/`
- [ ] **Notification icon**: Add `assets/notification-icon.png` (96×96 white icon on transparent bg)
- [ ] Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (copy from `.env.example`)
