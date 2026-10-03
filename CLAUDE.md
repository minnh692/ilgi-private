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
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set MODEL_PLUS=claude-sonnet-4-6
supabase secrets set MODEL_FREE=claude-haiku-4-5-20251001
supabase secrets set MODEL_UTILITY=claude-haiku-4-5-20251001
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
- **Quota**: free = 3 replies / rolling 7 days; plus = 10/day — enforced in Edge Function, never client
- **AI key never ships in app** — all Claude calls go through Edge Functions
- **Anonymous sign-in first**, Apple sign-in is an optional link (same user_id preserved)
- **No pgvector in MVP** — `buildContext()` in `_shared/context.ts` is the single retrieval function, designed to add vector search later
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
  - Set bundle ID: `com.ilgi.app`
- [ ] **EAS**: `eas login` with your Expo account, `eas build:configure`, set projectId in `app.config.ts`
- [ ] **Pretendard font**: Download from https://github.com/orioncactus/pretendard and place `.otf` files in `assets/fonts/`
- [ ] **Notification icon**: Add `assets/notification-icon.png` (96×96 white icon on transparent bg)
- [ ] Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (copy from `.env.example`)
