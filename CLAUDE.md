# folks — Claude Code Handoff

A voice-first AI journal that maps who you're closest to based on what you log. This file is the canonical context for any Claude conversation working on the project. Copy-paste this file (or reference it via `@CLAUDE.md`) when starting a new chat.

---

## Product

**Name:** folks (formerly "Circle")
**Tagline:** "an ai journal for exploring who you're really close to."
**Live URL:** `https://folks-five.vercel.app`
**Repo:** `https://github.com/robtywang/folks` (private)
**Status:** Live PWA, daily-dogfooding stage. Not yet TestFlight / App Store.

### Positioning

Not a generic journal app. Not a CRM. The journal is the **mechanism**; the ranking is the **product**. You open the app at night, write about something that happened, the AI reads it, your friends list re-orders. Over time it reveals patterns you didn't notice.

Target audience: 22–32, introspective, uses Letterboxd / Co-Star / Day One. Wants data, not therapy. The kind of person who opens an app at 9pm to think, not to do.

**Anti-personas:** people wanting deep journaling (use Day One), therapy-style commentary (use Reflectly), networking CRM (use Dex).

### The product moat is NOT the AI

Claude is commoditized — anyone can wrap it. folks defensibility comes from:
1. **Framing** — "find out who your real best friends are" lands emotionally on the target demographic
2. **Aesthetic** — cream, italic serif, Tabler outline icons, restrained
3. **Taste in what NOT to build** — no social, no notifications-spam, no chat
4. **Privacy positioning** — local-first storage IS a feature, repeatedly committed to

Don't pitch this as "the AI app for friendship." Pitch it as a journal with a calm aesthetic that quietly maps your circle.

---

## Tech stack (committed)

```
Framework:    Next.js 15.5.18 (App Router)
UI:           React 19 + TypeScript strict mode
Storage:      Dexie.js (IndexedDB) — all data local to device
AI:           @anthropic-ai/sdk
              · Claude Sonnet 4.6 for parse + insights
              · Claude Opus 4.7 for readings
              · Claude Haiku 4.5 for voice punctuation
Voice:        Web Speech API (browser-native)
Styling:      Tailwind CSS + CSS variables
Fonts:        Fraunces (serif), JetBrains Mono — Google Fonts
Icons:        Tabler webfont, OUTLINE variants only
Deploy:       Vercel (auto-deploy on git push to main)
PWA:          manifest.webmanifest + apple-touch-icon set; installable via Add to Home Screen
Auth:         None in v1. Everything anonymous, device-local.
```

### Required env vars

```
ANTHROPIC_API_KEY=sk-ant-...
```

Set in `.env.local` locally; set in Vercel Project Settings → Environment Variables for production. Without it, all API routes return `{"error":"no_api_key"}` and AI features degrade to mock parser (intentionally dumb).

### Build/dev commands

```
npm run dev       # localhost:3000
npm run build     # production build
npm run typecheck # tsc --noEmit
npm run lint      # next lint
```

`.npmrc` has `legacy-peer-deps=true` because React 19 + some libraries are peer-mismatched. `vercel.json` enforces the same install command server-side.

---

## Aesthetic — non-negotiable

Reference apps: Day One (spareness), Letterboxd (tracker structure), Co-Star (literary brevity).

### Palette (CSS vars in `app/globals.css`)

```
--bg-cream:        #FAF7F0   /* warm cream, not white */
--ink-primary:     #1F1A14   /* warm black */
--ink-secondary:   #8C7E5C   /* mid tan */
--ink-tertiary:    #B4A689   /* light tan */
--border-hair:     #D9CFBC   /* hairline borders */
--accent-coral:    #C8553D   /* primary actions, negative deltas */
--accent-sage:     #6F7D63   /* positive trends */
```

### Typography

- **Fraunces** (`var(--font-fraunces)`) — serif. Weights 400 + 500. Italic for prompts, names, special moments. Default body font.
- **JetBrains Mono** (`var(--font-mono)`) — for numbers, metadata, uppercase labels like "ALL ENTRIES", "TRAJECTORY".
- 16px horizontal padding throughout. 8–16px vertical rhythm.

### Iconography

- **Tabler outline only.** Never filled. Never emoji.
- 13–14px in metadata rows. 16–22px in primary actions. 22–28px in the (rare) hero mic state.

### What the aesthetic IS NOT

- Not a publication / masthead aesthetic
- Not dark mode (defer to v2)
- Not heavy chrome (no big shadows, no gradients, no glassmorphism)
- Not cute / twee / cottagecore
- Not aggressively designed — restraint is the point

### Restraint rule

Single coral accent point per screen (usually the mic). When in doubt, **remove chrome, don't add it.** If a design choice tips toward "designed app," step back.

---

## App architecture

### Pages

| Route | Purpose | Scroll? |
|-------|---------|---------|
| `/` | Home, compose-first. Date display, compose textarea, recent entries preview. | Scrollable |
| `/journal` | Reverse-chronological feed of all entries, grouped by day. Adaptive-border search bar. | Scrollable |
| `/ratings` | "your folks" — ranked + forming sections. (Don't call it "leaderboard" in UI.) | Scrollable |
| `/person/[id]` | Identity → inferences → who is X → reading → analytics → trajectory → entries → merge/remove. | Locked outer, internal scroll on content |
| `/settings` | You, security, help, data, developer, about. | Scrollable |
| `/onboarding/1..4` | 4-screen flow, gated by absence of passcode. | Locked |
| `/test` | Dev-only parser sandbox. | Scrollable |

### Scroll architecture

Body is globally locked: `html, body { overflow: hidden; height: 100dvh }` in `globals.css`. `.phone-frame` is `height: 100svh; overflow: hidden`. **Pages that need to scroll** (journal, ratings, settings, home) wrap their main in `h-[100svh] overflow-y-auto`. **Pages that are locked** use `h-[100svh] overflow-hidden` (or for profile, `flex flex-col` with an inner scroll region for content beneath the topbar).

### API routes (all in `app/api/*/route.ts`)

| Route | Purpose | Model |
|-------|---------|-------|
| `/api/parse` | Parse a raw entry → primary_person, sentiment, tags, confidence | Sonnet 4.6 |
| `/api/reading` | Generate a person's 1-3 sentence personality summary | Opus 4.7 |
| `/api/insights` | 2-3 short observational patterns about a person. **Pre-filtered statistically.** Local code finds patterns, Claude only phrases them. | Sonnet 4.6 |
| `/api/punctuate` | Clean voice transcript with punctuation + capitalization | Haiku 4.5 |
| `/api/status` | Returns `{aiReady: boolean}` — whether the server has `ANTHROPIC_API_KEY` loaded |  — |

### Data model (`types/index.ts`)

```ts
Entry {
  id, createdAt, updatedAt, text,
  personId | null,
  sentiment (1-10, AI-set, user-correctable),
  tags (max 3, fixed vocabulary),
  aiConfidence,
  userConfirmed,
  additionalPeople,
  aiPredictedPersonName,   // snapshot — drives parse correction memory
  aiPredictedSentiment,    // snapshot — drives sentiment correction memory
}

Person {
  id, name, nickname, relationship, profilePicture,
  closenessScore, closenessTrend, lastInteraction,
  entryCount, avgSentiment, muted, pinned,
  readingText, readingInferences, readingUpdatedAt,
  userContext,
  insightCards, insightsUpdatedAt,
  isTransient,
}

Meta (Dexie kv store) {
  hasCompletedOnboarding,
  hasSeenPasscodeWarning,
}
```

**Tag vocabulary** (`TAG_VOCABULARY` in `types/index.ts`) — fixed 20 tags as paired dimensions: energizing/draining, vulnerable/guarded, present/distant, warm/cold, supportive/exhausting, fun/boring, calm/anxious, honest/performative, generous/transactional, easy/effortful. Claude only returns tags from this list.

---

## Closeness algorithm (`lib/closeness.ts`)

```
base (0–10) = 0.30 × intensity   (recency-weighted |sentiment − 5.5|)
            + 0.55 × frequency   (log of last-90-day entries, saturating at 50)
            + 0.15 × depth       (% entries with vulnerable / honest / present / supportive tags)

perturbation (±0.5 max) = recent 2-week sentiment swing
display = base + perturbation, clamped 0–10
```

**Frequency is dominant by design** (recent user tuning). The intuition: people you write about a lot are people you actually think about a lot.

**Sample-size state** (`closenessState`):
- `entries < 3` → `forming` — no rank, no analytics displayed, "X of 3 entries" shown
- `entries >= 3` → `stable` — full score + trajectory + analytics

**Per-entry impact** (`entryImpacts`): for each entry, returns the closeness delta from including it. Used on profile entry timeline to show "+0.4" / "−0.2" badges next to entries.

**Trajectory** (`trajectoryFor`): `{ now, trendShort (vs 7 days ago, display), trendLong (vs 30 days ago, base) }`.

**Cadence** (`cadenceFor`): last interaction, avg interval between entries.

**Sentiment trend** (`sentimentHistory`): 12-week bucketed averages with delta vs prior 4 weeks. Rendered on profile via `<SentimentTrend>`.

---

## AI accuracy hardening — IMPORTANT

The model can hallucinate patterns when asked open-ended questions. To prevent this:

1. **Statistical pre-filter for insights.** `lib/insights.ts` detects real patterns *locally* (day-of-week sentiment, time-of-day, tag dominance, trajectory, gap unusual) with minimum cohort size + delta thresholds. Only patterns that pass the thresholds get sent to Claude. Claude's job is **phrase, not find.** This eliminates the main hallucination risk.

2. **Correction memory.** The last 5 user corrections (re-attributions, sentiment overrides) feed back into the next parse prompt as few-shot examples. Implemented in `lib/ai.ts`. `aiPredictedPersonName` and `aiPredictedSentiment` are snapshotted on save and never mutated — comparison to current entry state detects corrections.

3. **Confidence thresholds for attribution.**
   - `> 0.85` → auto-attribute, show "Logging to X · change"
   - `0.5 – 0.85` → soft prompt "is this about X? confirm or pick"
   - `< 0.5` → explicit picker

4. **Person emergence.** First mention of a new name with confidence > 0.7 → store as transient. Second distinct mention → promote to real person. Transient persons hide from the ratings page.

5. **Name disambiguation.** When AI extracts a name that collides with multiple existing people (same first name), the compose detection card shows a picker listing each candidate with relationship + last-seen + entry count. Plus a "+ a different X" option that prompts for a qualifier ("R" → creates "Maya R").

---

## Compose flow (`components/compose-card.tsx`)

The home page's primary surface. Heavily iterated. Current design:

- **No border, no card.** Textarea sits directly on cream page background.
- **Adaptive `…` placeholder.** Pulses opacity 25% → 65% → 25% on a 1.8s loop while empty.
- **Inline name highlighting.** Known person names get a faint coral chip (`.folks-name-highlight`) inline as you type/speak. Uses a textarea-mirror overlay div for the highlight to appear behind the caret.
- **Mention chips** below the textarea: when known names appear, render `fran · 5 prev` / `maya · 12 prev` coral chips so you can see you're building a thread.
- **Solid black writing line** (1px solid `ink-primary`) below the textarea — moves down as the textarea auto-grows. Reads as a notebook page being written on.
- **Muted mic.** 44px, no border, transparent background, `ti-microphone` glyph in mid-tan. Becomes the bold coral disc with stop icon only during active recording.
- **Auto-save draft** to localStorage (`folks_compose_draft`). Survives backgrounded app, reload, mid-recording crash. Cleared on successful save.
- **Voice punctuation.** When recording stops, raw transcript is sent to `/api/punctuate` (Claude Haiku). Status briefly shows `cleaning up…`. Result replaces raw text.
- **iOS speech recognition workarounds.** Single-utterance mode (`continuous = false`), auto-restarted in `onend` if user hasn't tapped stop — simulates continuous recognition without iOS Safari's continuous-mode bugs. Handles `no-speech` errors gracefully (just restarts).
- **Detection card** after save: shows attribution + name-clash picker + low-confidence prompt + feedback check-in + sentiment dots + tags + engine/confidence footer.

### Feedback check-in slider (`components/feedback-check-in.tsx`)

When AI flags an entry as heavy (sentiment ≤ 4 OR tag ∈ {draining, exhausting, anxious, cold}), the detection card surfaces a face-icon slider: `ti-mood-sad` (coral) → range slider → `ti-mood-happy` (sage). User drags to their felt-sense, taps "got it" → entry's sentiment is overridden + correction signal captured.

---

## Privacy commitments (user-facing promises)

- **Voice transcription is on-device** (Web Speech API in browser).
- **Default to local-only storage** (Dexie/IndexedDB). Cloud sync is explicit opt-in (v2).
- **Only entry text leaves device** — sent to Anthropic for parsing. Audio blobs stay local.
- **No social features in v1.** No sharing, no friend-of-friend, no public profiles, no exports of other people's names.
- **Data export** — one-tap JSON dump from settings.
- **Data delete** — irreversible "wipe everything" from settings, two confirmations.

---

## Lock / passcode system (`lib/lock.ts`)

PBKDF2-SHA-256, 100k iterations, 16-byte random salt. Hash stored in localStorage. Two unlock modes:
- `every-time` — every protected surface prompts on entry
- `this-session` — unlock once per tab session, re-lock on tab hide/close

Protected surfaces: `/journal`, `/ratings`, `/person/[id]`. **Home (`/`) is NOT locked** — compose stays one tap away.

Forgot-passcode flow: "wipe everything" path. Confirms twice, then clears all Dexie tables + relevant localStorage keys via `wipeEverything()`.

Onboarding gate: `hasLockPin()`. First-timers (no passcode) get routed to `/onboarding/1`. Setting a passcode during onboarding is what marks completion.

---

## User communication preferences

These are HARD preferences from the project owner. Violating them will cause friction:

- **Be critical/analytical, push back on scope creep.** Don't agree with everything. Honest disagreement is welcomed; sycophancy isn't.
- **Default to shipping sooner.** Don't gold-plate.
- **Build module-by-module, not whole-app-at-once.**
- **Don't write code that wasn't asked for.** No defensive abstractions, no future-proofing.
- **Concrete options over abstract advice.** When proposing alternatives, show them as a numbered list with tradeoffs.
- **Short responses for fast back-and-forth.** Tight paragraphs, no headers if not needed.
- **Be honest about limitations.** Don't pretend mock parser = real Claude.
- **Match the user's reading style.** They use lowercase casually and sentence fragments — your responses can too.

---

## What to AVOID

These have been explicitly rejected or are anti-patterns for this product:

- **Don't make the app a chatbot/agent.** Keep the journal-as-mechanism identity.
- **Don't add data collection** — privacy is the moat.
- **Don't add tap-to-correct buttons on AI insights** — feels like "review my homework," kills journaling flow.
- **Don't add filter UI on the journal** — use search; per-person filter is already on profile pages.
- **Don't try to build a proprietary AI model.** Wrappers win on UX/taste, not on ML.
- **Don't call the ratings page "leaderboard"** in UI copy. It's "your folks."
- **Don't add emojis to UI.** Tabler outline icons only.
- **Don't introduce competing aesthetic patterns** (purple gradients, Inter font, glassmorphism, default shadcn, big shadows).
- **Don't add dark mode in v1.**
- **Don't ship native iOS in v1.** PWA only. TestFlight is a v1.1+ decision.
- **Don't bundle ANTHROPIC_API_KEY into the client** ever. Server-side only.

---

## Open product questions (deferred, not resolved)

1. **Closeness philosophy.** Current model: intensity = closeness regardless of valence (extreme negative still adds to base). Open question: should this become "positive engagement only"? Owner has signaled the algorithm should still feel more dramatic on negative entries but explicitly likes seeing per-entry impact deltas now.
2. **Time-spent capture.** Currently not modeled. Could be inferred from text ("long talk" vs "quick wave") via parse — not yet implemented.
3. **AI agent intent detection.** Proposed: parse step detects when an entry is actually an instruction ("merge the two maya's", "actually mark is my brother"). Not yet built. Owner sees the appeal but doesn't want to lose the journaling identity.
4. **Ratings page redesign.** Proposed: keep ranked list + use first sentence of each person's existing Reading as the row body (turns the page from leaderboard → editorial almanac). Owner approved direction, not yet built.
5. **Journal-feel refactor.** Owner has flagged that `/journal` "feels like a feed." Proposed cleanups: larger date headers, drop quotation marks, soften row chrome, group same-day same-person entries as a session. Not yet built.
6. **TestFlight wrap.** Owner has Apple Developer account ready. Path: Vercel (done) → Capacitor wrap pointing at Vercel URL → Xcode archive → upload → TestFlight. Not started.
7. **App name.** "folks" is current. Owner has said this is working but not necessarily final.

---

## Repo layout

```
/app
  layout.tsx              Root layout with Fraunces + JetBrains Mono, manifest, viewport
  page.tsx                Home — compose + recent + first-folk flow
  globals.css             Color vars, phone-frame chrome, scroll lock, animations
  /api/parse              Claude Sonnet parse endpoint
  /api/reading            Claude Opus reading endpoint
  /api/insights           Claude Sonnet insights (statistically pre-filtered)
  /api/punctuate          Claude Haiku transcript cleanup
  /api/status             {aiReady} health check
  /journal                Entry feed with adaptive search
  /onboarding/1..4        4-screen flow, body scroll-locked by layout.tsx
  /onboarding/layout.tsx  Locks body+html overflow while in onboarding
  /person/[id]            Profile — locked outer, internal scroll on content
  /ratings                "your folks" ranked + forming sections
  /settings               You / security / help / data / developer / about
  /test                   Dev-only parser sandbox

/components
  compose-card.tsx        The home-screen compose surface (central piece, heavily iterated)
  sentiment-slider.tsx    10-dot row (used in detection card)
  feedback-check-in.tsx   Heavy-entry face-icon slider
  lock-screen.tsx         PIN-pad screen for protected surfaces
  pin-pad.tsx             4-digit pin input (label-wrapped native input)
  locked-recent.tsx       The home-screen "locked recent entries" teaser
  passcode-activity-tracker.tsx  Re-locks on tab hide via visibilitychange
  onboarding-demo.tsx     CSS-animated 9s loop on onboarding step 2
  sentiment-trend.tsx     12-week sentiment line chart for profile analytics
  sparkline.tsx           Reusable inline SVG sparkline (closeness history)
  progress-indicator.tsx  Onboarding 1—4 dots

/lib
  db.ts                   Dexie schemas + queries (findPersonByName, findPeopleByFirstName, createPerson, getMeta, setMeta)
  ai.ts                   parseEntry (real Claude + mock fallback), correction memory, name extraction
  reading.ts              generateReading (Opus), saveReading, updatePersonContext, READING_CATEGORIES
  insights.ts             detectPatterns (LOCAL statistical filter), generateInsights (Claude phrases them), saveInsights
  closeness.ts            baseClosenessFor, sentimentPerturbation, closenessFor, trajectoryFor, cadenceFor, sentimentHistory, entryImpacts, recomputePerson, recomputeAll
  save-entry.ts           saveEntry, updateEntrySentiment, updateEntryText, updateEntryAttribution, mergePerson, removePerson, deleteEntry, pruneAllOrphans, wipeEverything
  lock.ts                 PBKDF2 hashing, hint, isUnlocked, useLockState, UNLOCK_MODES
  seed.ts                 seedTestData (5 people, ~17 entries spread over 6 weeks)

/types/index.ts           Entry, Person, ParseResponse, Tag, TAG_VOCABULARY

/public
  manifest.webmanifest    PWA manifest
  apple-touch-icon.png    180×180 iOS home-screen icon
  icon-192.png / icon-512.png / favicon-16.png / favicon-32.png
  icon.svg                Vector source of italic-'f' wordmark

.env.local                ANTHROPIC_API_KEY (gitignored)
.env.local.example        Template for the env file (committed)
.gitignore                Excludes .env*.local, .next, node_modules
.npmrc                    legacy-peer-deps=true
vercel.json               Explicit install command for Vercel
```

---

## How to start a new conversation

When you open a fresh Claude chat to work on folks, paste this at the top of your first message:

> Reading the CLAUDE.md in this repo first. I'm working on folks — the AI journal that maps closeness based on what the user logs. The aesthetic is cream + italic serif + Tabler outline icons; the privacy story is local-only; the user prefers tight, critical, opinionated responses over agreeable ones. I'll push back on scope creep and default to shipping the smallest version of a feature.

Then state the actual task.

---

## Last-shipped reminders (rotating — update periodically)

- Closeness weights: intensity 30%, frequency 55%, depth 15% (frequency-dominant per recent tuning)
- Per-entry impact badges live on profile timeline (`+0.4` / `−0.2` mono labels next to timestamp)
- Compose has zero box chrome — adaptive `…`, solid black writing line below textarea, dashed-free mic
- Journal search uses dashed-to-solid border that solidifies on focus or type
- AI insights now statistically pre-filtered locally before Claude phrases them — eliminates pattern hallucination
- Voice transcript auto-punctuates via Haiku after recording stops ("cleaning up…")
- Sentiment correction signals are **captured** on save but **not yet fed into the parse prompt** as few-shot examples — wire that up when AI sentiment reads feel noisy

---

*Owner contact: arthurwangtennis@gmail.com · GitHub robtywang · Apple Developer account ready for TestFlight when PWA validates.*
