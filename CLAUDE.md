# folks — Claude Code Handoff

This is the canonical context for any Claude conversation working on **folks**. Reference it (`@CLAUDE.md`) when starting a new chat. It supersedes any earlier version of this file.

---

## Product

**Name:** folks
**Tagline:** *a journal for venting about the people in your life.*
**Live URL:** `https://folks-five.vercel.app`
**Repo:** `https://github.com/robtywang/folks` (private)
**Status:** Live PWA, daily-dogfooded. Pre-TestFlight.

### Positioning

folks is the **private, AI-augmented version of the late-night text to a friend**. The substitute behavior: you'd usually text your closest friend at 1am to vent about your mother / situationship / coworker. folks is the version where the listener has read everything you've ever said about that person, never gets tired, and gives you an honest read.

**Pitch line:** *"relationships are hard. folks makes it easier. talk about your friendships, your mom, the person you're dating — folks keeps notes for you and gives you suggestions. it's not a therapist. it's a smart friend who's read your diary and remembers everything."*

Target audience: 22–32, introspective, anti-engagement-bait. Uses Letterboxd / Co-Star / Day One. Likes data more than therapy talk.

**Anti-personas:** people looking for deep guided journaling (Day One), therapy-style commentary (Reflectly, Wysa), networking CRM (Dex), or social sharing.

### Why this and not "AI journal that maps closeness" (the original positioning)

That version satisfied a curiosity ("who's my real best friend?") — it didn't solve an ache. The new positioning solves a real ache ("I don't know what's going on with this person") which returns every time the user thinks about anyone in their life. Every entry produces a useful AI response in three seconds → built-in retention loop.

### The moat — be honest about it

folks's moat is **not** Claude itself; the API is commoditized. Defensibility comes from:

1. **Per-person corpus.** No other app has read 15 entries about your specific mom. That graph + the AI is the only thing folks has that nobody else does.
2. **Aesthetic + audience.** Cream, italic Fraunces, Tabler outline, restrained. The kind of taste that wins among the introspective-22-to-32 demographic but turns off a mass market.
3. **Taste in what NOT to build.** No social, no streaks, no chatbot drift, no notifications spam. Privacy positioning is a feature, not legal copy.

---

## Tech stack (committed)

```
Framework:    Next.js 15.5 (App Router)
UI:           React 19 + TypeScript strict mode
Storage:      Dexie.js (IndexedDB) — all data local to device
AI:           @anthropic-ai/sdk
              · Sonnet 4.6  — entry parsing, "folks says" chat
              · Opus 4.7    — Reading synthesis + weekly recap (built, deferred)
              · Haiku 4.5   — voice transcript cleanup
Voice:        Web Speech API (browser-native)
Styling:      Tailwind CSS + CSS variables
Fonts:        Fraunces (Georgia fallback), JetBrains Mono — Google Fonts
Icons:        Tabler webfont, OUTLINE variants only
Animation:    Framer Motion
Deploy:       Vercel (auto-deploy on push to main)
PWA:          manifest.webmanifest + apple-touch-icon set
Auth:         None in v1. Anonymous, device-local. Optional 4-digit passcode.
```

### Required env vars

```
ANTHROPIC_API_KEY=sk-ant-...
```

In `.env.local` locally; in Vercel Project Settings → Environment Variables for production. Without it, every API route returns `{"error":"no_api_key"}` and `lib/ai.ts` falls back to a mock parser (intentionally dumb — don't tune confidence thresholds against it).

### Build / dev commands

```
npm run dev       # localhost:3000
npm run build     # production build
npm run typecheck # tsc --noEmit
npm run lint      # next lint
```

`.npmrc` has `legacy-peer-deps=true` (React 19 + a couple of libs are peer-mismatched). `vercel.json` enforces the same install command server-side.

---

## Aesthetic — non-negotiable

Reference apps: **Day One** (spareness), **Letterboxd** (item-first structure), **Co-Star** (literary brevity, daily ritual).

### Palette (CSS vars in `app/globals.css`)

```
--bg-cream:        #FAF7F0   /* warm cream, not white */
--ink-primary:     #1F1A14   /* warm black */
--ink-secondary:   #8C7E5C   /* mid tan */
--ink-tertiary:    #B4A689   /* light tan */
--border-hair:     #D9CFBC   /* hairline borders */
--accent-coral:    #C8553D   /* primary actions, latest sentiment when heavy */
--accent-sage:     #4FA040   /* positive sentiment, "folks has noticed" cards */
```

### Typography

- **Fraunces** (`var(--font-fraunces)`) — serif, italic by default for prompts / names / dates. Weights 400 + 500.
- **JetBrains Mono** (`var(--font-mono)`) — for metadata, uppercase labels (`STEP ONE`, `YOUR FOLKS`, `WARM · 6 ENTRIES`).
- 16px horizontal padding throughout. 12–16px vertical rhythm.

### Iconography

- **Tabler outline only.** Never filled. Never emoji.
- Custom SVGs OK for app-specific marks (the home people-icon, the journal book CTA, the listening bars) — keep them in line with Tabler's 1.2px stroke / minimal style.

### What the aesthetic IS NOT

- Not a publication aesthetic, not a wellness app aesthetic
- Not dark mode (defer to v2)
- Not heavy chrome (no big shadows, no gradients, no glassmorphism)
- Not cute / twee / cottagecore
- **Single coral accent point per screen** when possible (usually the primary CTA)
- When in doubt, **remove chrome, don't add it**

---

## App architecture

### Pages

| Route | Purpose | Notes |
|---|---|---|
| `/` | Home — compose + entrance animation. Tap mic → records locally; tap send → navigates to `/chat?seed=...&voice=1`. | People icon top-left → /folks. Settings cog top-right → /settings. Wordmark center. Bottom: "enter your journal →" CTA. |
| `/chat` | Full-screen vent surface. Each user turn auto-fires `/api/folks-says`. Voice auto-commits on 1.6s silence. Text uses an explicit send button. Compile-and-edit drawer for "send to journal". | Voice mode: recognition initialized once and mute-toggled (one permission, one ding per session). Listening bars + "tap to speak" / "listening…" label in the mic button. |
| `/journal` | Entry log, reverse-chronological, grouped by day. Adaptive search bar that highlights matches inline. Names linked + coral inline. Tap any entry to edit. Two-tap coral pill delete bottom-left of editor. | No noticed-feed at the top. No settings cog (home owns it). |
| `/folks` | Per-friend list, sorted by most-recent activity. Each row: monogram + name + (tone · entry count · last seen). Tap → friend journal. | Sage tone for warm, coral for heavy. |
| `/person/[id]` | **Friend journal.** Identity + sentiment chip row + "what folks has noticed" Reading + sentiment tracker (smoothed curve over last 16 entries) + chronological entries. Merge/remove at the bottom. | Closeness score deliberately NOT shown. The math runs in the background but never surfaces. |
| `/write` | Manual entry — skips chat entirely. Just date header, textarea, "send to journal" pill. | "Going straight to your journal — no AI involved" footer. |
| `/settings` | You / security / help / data / developer / about. | Reachable via gear on home (only). |
| `/onboarding/1..7` | 7-screen first-launch flow. | Body scroll locked via `onboarding/layout.tsx`. |
| `/test` | Dev-only parser sandbox. | Reachable from `/settings → developer`. |
| `/dev/closeness` | Dev-only closeness math explorer. | Same. |

### API routes (`app/api/*/route.ts`)

| Route | Purpose | Model |
|---|---|---|
| `/api/parse` | Parse a raw entry → primary_person, sentiment, tags, confidence | Sonnet 4.6 |
| `/api/folks-says` | The grounded chat response. Takes the just-typed thought + the primary person + their journal corpus + recent chat history + any other known names mentioned. Returns a 1-2 sentence friend-voice reply. | Sonnet 4.6 (Opus 4.7 if `person.entryCount ≥ 10`) |
| `/api/summarize-chat` | Compile chat turns into a single first-person journal entry with light grammar cleanup. Used by chat's "send to journal" flow. | Sonnet 4.6 |
| `/api/reading` | Per-friend qualitative synthesis ("what folks has noticed"). | Opus 4.7 |
| `/api/punctuate` | Clean voice transcript with punctuation + capitalization. | Haiku 4.5 |
| `/api/status` | `{aiReady: boolean}` — health check for `ANTHROPIC_API_KEY` presence. | — |
| `/api/prompts`, `/api/weekly-recap`, `/api/insights` | **Built but not surfaced.** Per-friend prompted questions, Sunday digests, statistical insight cards. Either we wire them back in or strip in cleanup. | Sonnet / Opus |

### Data model (`types/index.ts`)

```ts
Entry {
  id, createdAt, updatedAt, text,
  personId | null,
  sentiment (1-10),
  tags (max 3, fixed vocabulary),
  aiConfidence, userConfirmed, additionalPeople,
  aiPredictedPersonName, aiPredictedSentiment,
  severity (0-3),
}

Person {
  id, name, nickname, relationship, profilePicture,
  closenessScore, closenessTrend, lastInteraction,
  entryCount, avgSentiment, muted, pinned,
  readingText, readingInferences, readingUpdatedAt,
  userContext,
  insightCards, insightsUpdatedAt,
  isTransient,  // lazy-created from chat mention, no journal entries yet
}

Meta (kv) {
  hasCompletedOnboarding, hasSeenPasscodeWarning, firstStableSeenAt,
}

WeeklyRecap, FriendPrompt — built but unused
```

**Tag vocabulary** is 20 paired tags (energizing/draining, vulnerable/guarded, present/distant, warm/cold, supportive/exhausting, fun/boring, calm/anxious, honest/performative, generous/transactional, easy/effortful). Claude returns tags drawn from this list only.

---

## Closeness math (`lib/closeness.ts`)

Runs in the background to weight things like sentiment tone labels (warm / mixed / heavy) and per-person `lastInteraction`. **No numerical closeness score is ever displayed.** The math is plumbing now.

```
base (0–10) = 0.30 × intensity     (recency-weighted max(0, sentiment − 5.5))
            + 0.55 × frequency     (log of last-90-day entries, saturating at 50)
            + 0.15 × depth         (% entries with vulnerable / honest / present / supportive)

perturbation (±0.5 max) = recent 2-week sentiment swing
severity penalty (≤0)   = sum of (severity² × scale × recency-decay), capped
display = clamp(base + perturbation + severityPenalty, 0, 10)
        ↑ with a hard ceiling of 3.0 when any severity-3 entry exists in the last 30 days
```

Positive-only base intensity (the `max(0, ...)`) is asymmetric on purpose: writing "she hated me" should NOT bump closeness up the way "she gave me a cookie" does.

---

## AI accuracy hardening — IMPORTANT

1. **Statistical pre-filter for insights** (in `lib/insights.ts`). Local code detects patterns; Claude only phrases them. Eliminates the main hallucination failure mode. Insights surface is currently dormant but the detector is still consumed by the (also dormant) prompts system.

2. **Correction memory.** The last 5 user re-attributions feed back into the next parse prompt as few-shot examples. Implemented in `lib/ai.ts`. `aiPredictedPersonName` is snapshotted on save and never mutated — comparison detects corrections.

3. **Confidence thresholds for attribution.**
   - `> 0.85` → auto-attribute, show "Logging to X · change"
   - `0.5 – 0.85` → soft prompt "is this about X? confirm or pick"
   - `< 0.5` → explicit picker

4. **Person emergence + lazy creation.**
   - First mention of a new name (parse confidence > 0.7) → stored as `transient`
   - Second distinct mention → promoted to a real person
   - Chat lazy-persists transient persons on mention (in `app/chat/page.tsx`'s `commitDraft`) so context survives across chat sessions even when the user never explicitly hits "send to journal"

5. **Name disambiguation.** When a parsed name collides with multiple existing first-name matches, the compose detection card surfaces a picker. Not currently wired into chat (chat picks the first match + sends `mentionedPeople: string[]` to the API so the AI can acknowledge every known name in the turn).

6. **Severity-3 safety guardrail** (in `/api/folks-says`). Server-side keyword check on the CURRENT user text only — old journal entries don't trigger safety on benign new messages. Matches return a hardcoded safety template, never an LLM call. **Don't reinstate the corpus-severity check that was here previously**; it produced false positives on benign turns when a prior entry had been mis-parsed.

---

## Compose flow (`app/chat/page.tsx`, `app/page.tsx`)

### Home

- Compose-first home: wordmark + date + greeting + textarea + action row + bottom "enter your journal" CTA.
- Voice + text. Voice fills the textarea locally; user reviews → taps `send →` → navigates to `/chat?seed=...&voice=1` (the `voice=1` flag tells chat to auto-resume listening).
- Manual entry alternative: when the textarea is empty, the right side of the action row reads `or manual entry →` and navigates to `/write` (skip-AI journal write).
- Entrance animation: each block fades-up via Framer Motion at staggered delays (0.05–0.7s).

### Chat

- Seed message renders synchronously on mount; parse + folks-says fire in the background so the chat never looks blank.
- Voice mode: recognition is initialized once and mute-toggled. Auto-commits on 1.6s silence (typing always requires explicit send).
- Folks-typing dots while awaiting `/api/folks-says`. The most recent folks reply stays at opacity 1.0 until the user posts another message, then fades to opacity 0.28 — stale-based fade, not time-based.
- Send-to-journal: opens a bottom drawer with the chat compiled (Sonnet 4.6 via `/api/summarize-chat`) into a single first-person paragraph. User edits, taps `save to journal →`, lands on `/journal`.

### The "folks says" voice

The most-iterated thing in the codebase. Voice rules live in `/api/folks-says/route.ts`'s `sharedVoiceRules`:

- Close friend over text. NOT a therapist. NOT an analyst.
- 1-2 short sentences, occasionally 3, never long paragraphs.
- Casual sounds OK ("ugh", "oof", "huh").
- Open questions over statements. "what did she say?" beats a five-step plan.
- BANNED: "i hear you" / "that's valid" / "i understand" / "based on N entries about X…".
- Reference past patterns casually: *"kate has that thing where she goes cold when she's stressed — could be that?"* — NOT *"based on 7 entries about kate…"*.

When folks doesn't have enough corpus, it acknowledges the name without pretending it's the first time hearing it: *"oh nice, hanging with elon and daniel?"* — not *"who are they?"*. There's an explicit `mentionedPeople: string[]` field in the request payload + a hard rule in the prompt to never ask "who is X" when X is in the known-names list.

---

## Privacy commitments (user-facing promises)

- **Voice transcription is in-browser** (Web Speech API). Audio blobs never leave the device.
- **Default to local-only storage** (Dexie / IndexedDB). No cloud sync. No backups under our control.
- **Only entry text leaves device** — sent to Anthropic for parsing + chat responses + readings. Anthropic API defaults: no training on inputs, no retention past the request, no human review on the normal path.
- **Data export** — one-tap JSON dump from settings.
- **Data delete** — irreversible wipe of Dexie + meta + passcode from settings, double-confirmed.

Marketing line: *"we don't keep your entries. anthropic doesn't either. only your device does."*

---

## Lock / passcode system (`lib/lock.ts`)

PBKDF2-SHA-256, 100k iterations, 16-byte random salt. Hash stored in localStorage. Two unlock modes (configurable in settings):

- `every-time` — every protected surface prompts on entry
- `this-session` — unlock once per tab session, re-lock on tab hide

Protected surfaces: `/journal`, `/folks`, `/person/[id]`. **Home (`/`) is NOT lock-gated** — compose stays one tap away.

Forgot-passcode → factory wipe (`wipeEverything()` clears Dexie + lock keys + meta + user prefs). Two confirmations.

Onboarding gate on home: routes first-launch users (no `hasCompletedOnboarding` meta + no passcode) to `/onboarding/1`.

---

## Onboarding (`app/onboarding/{1..7}`)

Linear, 7 screens, no skip (except the optional name on screen 6).

1. **Hero quote** — *"write hard and clear about what hurts." — Ernest Hemingway*
2. **Brand + pitch** — *"folks. a journal for venting about the people in your life."*
3. **Step one: vent** — typing demo that cycles 4 longer examples using names (Elon, Jamie, Mom, Katherine). Mirrors the actual compose surface exactly.
4. **Step two: track + read** — 4 staggered friend rows + sage "FOLKS'S READ ON ELON" card.
5. **Privacy** — *"yours, only."* + 4 × `ti-x` items (no email / no phone / no account / no cloud backup) + anthropic in-flight note.
6. **Name capture** — *"what should we call you?"* — writes `localStorage.folks_user_name`, optional (pill flips skip ↔ next).
7. **Passcode** — on-screen `PinKeypad` (italic 24px digits, no chrome). Two-phase enter → confirm. On success: `setLockPin(pin)` + `setMeta('hasCompletedOnboarding', true)` + `router.replace('/')`.

Shared components in `components/onboarding/`: `ProgressDots`, `PillButton`, `PinKeypad`, `TypingDemo`, `FriendRow`.

---

## User communication preferences — HARD

These are non-negotiable preferences from the project owner. Violating them creates friction:

- **Be critical / analytical. Push back on scope creep.** Don't agree with everything. Honest disagreement welcome; sycophancy not.
- **Default to shipping sooner.** Don't gold-plate.
- **Build module-by-module, not whole-app-at-once.**
- **Don't write code that wasn't asked for.** No defensive abstractions, no future-proofing.
- **Concrete options over abstract advice.** Numbered list with tradeoffs > paragraph of options.
- **Tight responses.** Short paragraphs, no headers unless needed.
- **Be honest about limitations.** Don't pretend the AI works without an API key, don't pretend dead code is wired up.
- **Match the lowercase / sentence-fragment style** when responding casually.

---

## What to AVOID

Explicitly rejected, in conversation or in CLAUDE.md history:

- **Don't make the app a chatbot/agent.** The chat is bounded by the user's corpus on a specific person. No free-form general AI conversation.
- **Don't add data collection.** Privacy is the moat.
- **Don't add filter UI on the journal.** Use search. Per-person filter exists on `/person/[id]`.
- **Don't try to build a proprietary AI model.** Wrappers win on UX/taste, not on ML.
- **Don't call the friend list "leaderboard" or "ratings".** It's "your folks."
- **Don't add emojis to UI.** Tabler outline icons only.
- **Don't introduce competing aesthetic patterns** (purple gradients, Inter font, glassmorphism, default shadcn, big shadows, animated wave SVGs).
- **Don't add dark mode in v1.**
- **Don't ship native iOS in v1 without Capacitor wrap.** PWA is the v1.
- **Don't bundle `ANTHROPIC_API_KEY` into the client.** Server-side only.
- **Don't reinstate the corpus-severity-3 check in `/api/folks-says`.** False-positives on benign turns. Keep the safety check on current user text only.
- **Don't display closeness scores or rankings to the user.** The math is plumbing.

---

## What's deferred but built

These have full implementations in the tree but no UI surfaces them right now. Either re-surface them as features or rip them in a cleanup pass — they're maintenance burden either way.

- `lib/prompts.ts` + `app/api/prompts/` — per-friend prompted questions
- `lib/weekly-recap.ts` + `app/api/weekly-recap/` — Sunday digests
- `lib/insights.ts` + `app/api/insights/` — pattern-as-observation cards (only `detectPatterns` is consumed externally, by `lib/prompts.ts`)

The `/settings → developer` section has dev-trigger buttons for these that should also be cleaned up.

---

## Repo layout

```
/app
  layout.tsx              # root layout, fonts (Fraunces + JetBrains Mono), manifest, viewport
  page.tsx                # home — compose + entrance animation
  globals.css             # palette + base styles + keyframes (blink-caret, dot-pulse, onboarding-fade-in, ...)
  chat/page.tsx           # the vent surface
  journal/page.tsx        # entry log + search + inline edit
  folks/page.tsx          # per-friend list
  person/[id]/page.tsx    # friend journal + sentiment tracker
  write/page.tsx          # manual entry (skip AI)
  settings/page.tsx       # you / security / help / data / developer / about
  onboarding/{1..7}/      # 7-screen first-launch flow
    layout.tsx            # body scroll lock
  test/page.tsx           # dev-only parser sandbox
  dev/closeness/page.tsx  # dev-only closeness math explorer
  api/parse               # Sonnet — entry → primary_person + sentiment + tags
  api/folks-says          # Sonnet/Opus — grounded chat response
  api/summarize-chat      # Sonnet — compile chat into a journal entry
  api/reading             # Opus — per-friend Reading
  api/punctuate           # Haiku — voice transcript cleanup
  api/status              # health check
  api/prompts             # Sonnet — friend prompts (built, not surfaced)
  api/weekly-recap        # Opus — Sunday digests (built, not surfaced)
  api/insights            # Sonnet — pattern cards (built, not surfaced)

/components
  listening-bars.tsx          # animated audio meter (home + chat)
  pin-pad.tsx                 # device-keyboard pin entry (settings)
  lock-screen.tsx             # passcode gate on protected surfaces
  passcode-activity-tracker.tsx  # re-lock on tab hide
  sentiment-trend.tsx, sparkline.tsx, etc. — legacy, used by dev surfaces
  onboarding-demo.tsx         # legacy onboarding mini-demo (superseded by onboarding/TypingDemo)
  onboarding/
    ProgressDots.tsx          # 7-dot indicator
    PillButton.tsx            # coral pill (matches chat send-to-journal)
    PinKeypad.tsx             # on-screen 3×4 numeric keypad (onboarding only)
    TypingDemo.tsx            # cycling typing animation for screen 3
    FriendRow.tsx             # staggered friend rows for screen 4

/lib
  db.ts                       # Dexie schemas + getMeta/setMeta + person lookups
  ai.ts                       # parseEntry (real + mock fallback), correction memory
  closeness.ts                # background sentiment math (no UI)
  reading.ts                  # generateReading + saveReading + READING_CATEGORIES
  save-entry.ts               # saveEntry, updateEntryText, updateEntryAttribution, mergePerson, removePerson, deleteEntry, pruneAllOrphans, wipeEverything
  lock.ts                     # PBKDF2 hashing, unlock state, useLockState
  session-prompts.ts          # time-of-day placeholder rotator on home
  prompts.ts                  # per-friend prompted questions — DORMANT
  weekly-recap.ts             # Sunday digests — DORMANT
  insights.ts                 # statistical pattern detection — partial use (detectPatterns)
  reading-auto.ts             # threshold-based auto-fire of generateReading
  seed.ts                     # /settings → "load test data"

/types/index.ts               # Entry, Person, ParseResponse, Tag, TAG_VOCABULARY, WeeklyRecap, FriendPrompt

/public
  manifest.webmanifest        # PWA manifest
  apple-touch-icon.png        # 180×180 iOS home-screen icon
  icon-{192,512}.png / favicon-{16,32}.png / icon.svg

PIVOT.md                      # strategy doc, written during the venting-app pivot
UI_REDESIGN.md                # companion spec doc
.env.local                    # ANTHROPIC_API_KEY (gitignored)
.env.local.example
.gitignore                    # excludes .env*.local, .next, node_modules
.npmrc                        # legacy-peer-deps=true
vercel.json                   # explicit install command for Vercel
tailwind.config.ts            # color + font tokens
```

---

## How to start a new conversation

Paste this at the top of your first message:

> Reading the CLAUDE.md in this repo first. I'm working on folks — a journal for venting about the people in your life. The aesthetic is cream + italic Fraunces + Tabler outline; the privacy story is local-only with in-flight Anthropic reads; the user prefers tight, critical, opinionated responses over agreeable ones. I'll push back on scope creep and default to shipping the smallest version of a feature.

Then state the actual task.

---

## Last-shipped reminders (rotating — update periodically)

- **Voice as input method, not a separate mode.** Mic fills the textarea on home + chat; chat auto-commits on 1.6s silence, home doesn't.
- **Recognition kept alive across toggles** via a `muteRef` — one permission prompt + one start-ding per chat session, not per tap.
- **Stale-based folks fade** in chat: latest reply stays opacity 1.0; previous folks reply fades to 0.28 the moment the user posts another message.
- **Lazy person creation** in chat: any name mentioned with parse confidence ≥ 0.6 gets a transient Person record. Solves cross-session "who is X?" amnesia.
- **`mentionedPeople: string[]`** is sent to `/api/folks-says` so the AI acknowledges every known name in the turn, not just the first match's corpus.
- **Sentiment tracker** on friend journal: smoothed curve over the last 16 entries, sage when latest is warm (≥5.5), coral when heavy. Sentiment 5.5 dashed midline. Dots at each point, halo on the most recent.
- **The onboarding typing demo on screen 3 mirrors the real compose** — borderless, hairline below, mic + send action row using the shipped colors and sizes.

---

*Owner contact: arthurwangtennis@gmail.com · GitHub robtywang · Apple Developer account ready for TestFlight when PWA validates.*
