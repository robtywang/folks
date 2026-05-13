# folks — project context

A portable summary of what folks is, what's been built, and where it stands. Paste this into any Claude conversation to give the model the context it needs to discuss strategy, advertising, distribution, monetization, etc.

---

## product in one paragraph

**folks** is a voice-first friends tracker. The user opens the app, types or talks about whatever just happened (a coffee with Maya, a draining dinner with Jordan), and AI extracts who it was about, the sentiment, and behavioral tags. A ranked list of friends emerges by **closeness** — a recency-weighted composite of sentiment, frequency, and variety of interactions. Over time, the rankings reveal who you're actually investing in vs. who you think you are.

**The pitch**: *"Find out who your real best friends are."*

**The thesis**: positioning it as a **friends tracker, not a journal app**. The journal-style input is the *mechanism*. The ranking and pattern-surfacing is the *product*. This is the core differentiator — every other journal app focuses on the act of writing; folks focuses on what the writing reveals.

---

## target user

**Personas**: 22–32 year olds who use Letterboxd, Co-Star, BeReal, Day One. Introspective about social patterns. Want data, not therapy. Quietly competitive about self-knowledge. Comfortable with "this is a little self-absorbed but also kind of healthy."

**Anti-personas**:
- People wanting deep journaling → use Day One
- People wanting therapy-style commentary → use Reflectly
- People building a networking CRM → use Dex / Clay
- People wanting social/sharing features → not the audience; folks is private-by-design

---

## aesthetic & positioning

**Visual reference points**: Day One (spareness), Letterboxd (tracker structure), Co-Star (literary brevity). NOT Notion, NOT Linear, NOT a generic SaaS dashboard.

**Palette**: warm cream `#FAF7F0` bg, warm-black ink, mid/light tan secondaries, coral primary action (only saturated thing on screen — the mic FAB), bright green/red for trend signals only.

**Typography**: Fraunces serif (italic for prompts/special moments) for display + body; JetBrains Mono for numbers and metadata. Weights 400 and 500 only.

**Icons**: Tabler outline icons exclusively (never filled variants, never emoji).

**Anti-aesthetic**: no glassmorphism, no purple gradients, no chip badge proliferation, no Notion-property-panel vibes, no dark mode (v1 deferred), no chrome-for-chrome's-sake. Restraint is the aesthetic.

---

## core flows

1. **Logging**: user opens app → lands on compose surface → talks or types → save → AI parses → attribution chip + sentiment + tags shown in a detection card with editable rating and "change attribution" picker
2. **Ranking**: closeness recomputes locally on every save → friends list re-orders → sparklines and trend arrows update
3. **Reading**: per-person AI summary ("the reading") with a category label like "close friend" / "drifting" / "something more", short literary prose, and behavioral inferences ("coffee buddy", "supportive listener") inferred from entry content
4. **Privacy at rest**: home page shows locked previews of recent entries (names visible, entry text is *redacted bars, not real text in the DOM* — devtools can't read it either). Tap a card to drill into the person profile where text is visible in context.

---

## screens currently built

- **Home (`/`)** — capture-first: header (leaderboard icon left, journal + settings right), italic date as journal-page eyebrow, large compose card with bigger Fraunces textarea, sculpted coral mic FAB with expanding pulse rings while recording, live transcription view that replaces the textarea while recording (committed text + interim italic + blinking caret). Below: "locked previews" of 3 most recent entries (name visible, text redacted to two pill bars — actual text isn't even rendered in the DOM).
- **Compose detection card** — appears after save, persists until user starts a new entry. Shows engine (mock/claude), confidence %, attribution with **"change" picker (typeahead text input — type a name, browser autocompletes from existing people, otherwise creates new on save)**, editable 10-dot sentiment rating, AI tags. **Confirmation prompt** fires when AI confidence < 70%: "is this really about X?" with yes/change buttons.
- **Journal (`/journal`)** — chronological feed of all entries, **gated by 4-digit passcode if set**. Each row has a date column on the left (e.g. "MAY 13 / 12:47 AM" in mono) and a content column on the right with name, text, tags, plus pencil/trash icons. Inline edit includes the same typeahead attribution picker.
- **Ratings (`/ratings`)** — ranked list, no section header, each row: name vertically centered left, sparkline + diagonal arrow (bright green up / bright red down) + score right, tiny "last updated" timestamp tucked against the hairline divider.
- **Person profile (`/person/[id]`)** — avatar + name + AI category, behavioral inference chips ("coffee buddy", "supportive listener" etc), **user-written "who is X" context** that the AI weights heavily, The Reading card (AI prose with rerun), Posts (chronological entries), Analytic data (factor bars showing sentiment/frequency/variety contributions to closeness).
- **Settings (`/settings`)** — sections for **you** (name + about, fed into AI prompts), **security** (4-digit passcode setup with confirm step), **help** (re-run onboarding link), **data** (export, delete all), **developer** (test parser, load test data), **about** (version, AI status).
- **Onboarding (`/onboarding`)** — 3-step intro: welcome → how it works → privacy. Skippable. Auto-shown on first run via localStorage flag (`folks_onboarded`).
- **Test parser (`/test`)** — sandbox: type any phrase, parser runs without saving, results stack as cards showing engine/confidence/attribution/sentiment/tags. Includes clickable suggestion chips for common test inputs.
- **Lock screen** (used by `/journal` when passcode is set) — iOS-style 4-dot passcode pad, auto-verifies on 4th digit, shake on wrong. Unlock persists for session.

---

## tech stack (committed)

- **Framework**: Next.js 15 (App Router), TypeScript strict mode
- **Styling**: Tailwind CSS + CSS variables for palette
- **Local storage**: IndexedDB via Dexie.js with `useLiveQuery` for reactivity
- **AI parsing**: Claude Sonnet 4.6 per-entry via `/api/parse` server route
- **AI reading**: Claude Opus 4.7 per-person via `/api/reading` server route (only when entries ≥3)
- **Voice**: Web Speech API (browser-native — note: routes audio to Google's cloud despite "on-device" marketing claims; flag for any privacy positioning)
- **Icons**: Tabler webfont via CDN
- **Fonts**: Fraunces + JetBrains Mono via Google Fonts
- **Deployment**: Vercel (free tier; not yet deployed — local-only)
- **Auth**: skipped in v1 — everything anonymous + local. Add Supabase later if sync becomes a need.
- **Mobile wrap**: PWA-first; native iOS deferred to v2+
- **No external UI libs**: no shadcn, no MUI. Hand-built to maintain aesthetic control.

---

## privacy commitments (user-facing promises)

- Default to **local-only storage** in IndexedDB on the user's device. Cloud sync is explicit opt-in (deferred to v2).
- Only the **transcript text** is sent to Anthropic for AI parsing. Audio blobs stay local.
- **No social features in v1** — no sharing, no friend-of-friend, no public profiles, no exports of other people's names.
- One-tap **data export** (JSON dump) and irreversible **data delete** (two confirmations).
- **Optional 4-digit passcode** to gate the journal — SHA-256 hash stored in localStorage; unlocks last for the tab session only. Not crypto-grade (a determined attacker with filesystem access could bypass it) — it's there to stop casual phone-glances.
- **Locked previews** on the home screen render entry text as redacted bars, *not* blurred real text. The actual text isn't in the DOM, so devtools can't read it either.
- *Honest caveat*: the Web Speech API routes audio to Google's cloud, despite browser framing. If on-device transcription becomes a hard requirement, that's a v2 build (Whisper local, or different API).

---

## AI architecture

**Per-entry parsing (Sonnet 4.6)** — single API call, ~500 tokens in / 200 out, ~$0.005/entry. Returns JSON with `primary_person`, `is_new_person`, `confidence`, `is_solo`, `sentiment` (1–10), `tags` (from a fixed 20-word vocabulary of paired dimensions like energizing/draining, present/distant), `additional_people`, `context_summary`. Confidence below 0.7 triggers an inline confirmation prompt; above that, the attribution is shown with a "change" affordance.

**Person emergence**: new name + confidence ≥0.7 → stored as transient (visible in entries but not in main list); second distinct mention → promoted to "real" person.

**Per-person reading (Opus 4.7)** — generated when person has ≥3 entries. Returns `{ category, summary, inferences[] }`. Category comes from a fixed vocabulary of 11 (new friend, close friend, best friend, old friend, something more, romantic, partner, family, coworker, complicated, drifting). Summary is 1–3 sentences in observational Co-Star/Letterboxd voice — never advisory. Inferences are 2–4 short behavioral patterns inferred from entry content ("coffee buddy", "running partner", "venting friend"). User-written context (the "who is X" section) gets weighted heavily in the prompt.

**Correction memory (in-context learning)** — every entry stores `aiPredictedPersonName` at parse time, never mutated. Every parse call to Sonnet now includes the last 5 entries where the AI's original guess differs from the current attribution + the user confirmed (i.e., real corrections). These are formatted as few-shot examples in the prompt: *"AI said 'Bro', user corrected to 'Fran' — apply this kind of judgment."* The mock parser also uses these to build a dynamic stopword set. **This is in-context personalization, not model training** — Claude's weights are not changed; the prompt is getting richer over time.

**Mock fallback**: when `ANTHROPIC_API_KEY` is unset, the server returns 503 and a heuristic regex+keyword parser kicks in. Handles lowercase names after verbs ("with kate"), filters informal address words (Bro, Dude, Yo) and generic nouns (mom, coffee, work), normalizes capitalization. Intentionally less reliable than real Claude. Engine (mock vs claude) is always visible on the detection card and test sandbox.

---

## closeness algorithm (pure local, no API)

Runs on every save. Per person, over a 90-day window:

```
weighted_sentiment = Σ(entry.sentiment × exp(-daysAgo / 30)) / Σ(weights)
freq_factor        = min(entry_count / 10, 1.0)
variety            = distinct_tag_combos / 5  (capped at 1)

closeness = clamp(
  weighted_sentiment × 0.6 +
  freq_factor × 3 +
  variety × 1,
  0, 10
)

trend = closeness_now - closeness_7_days_ago
```

Tunable parameters (post-launch A/B candidates): recency decay (30-day half-life), frequency cap (10), the sentiment-vs-frequency weights (0.6 vs 3.0).

The profile's "analytic data" section exposes this breakdown so the user can see *why* a person is ranked where they are.

---

## what's been ruled out (don't suggest these as if new)

- Generic React button UI / SaaS dashboard aesthetic
- Filled icon variants
- Dark mode in v1
- Emoji in UI
- External UI component libraries (shadcn, MUI, etc.)
- Landscape orientation
- Native iOS in v1 (PWA only)
- Social/sharing features in v1
- Cloud sync in v1
- Dedicated Insights tab (deferred — recap will be a weekly push + single Sunday card instead)
- Auth in v1 (anonymous + local)
- Multi-language beyond English in v1
- Photo attachments on entries
- Place/activity tagging

---

## current state (prototype maturity)

**Working**: full local-only daily-use loop. You can install test data (5 people, ~17 entries), type or speak entries, see the AI parse them, override attribution (typeahead picker)/sentiment/text, generate person readings (mock or real), browse journal/ratings/profile pages, export and wipe data. Onboarding shows on first run. Optional 4-digit passcode locks the journal. AI gets richer over time via the correction-memory loop.

**Not wired**:
- PWA install manifest (referenced in layout but file doesn't exist yet)
- App icons / splash screen
- Capacitor wrap (for actual App Store)
- Weekly recap notifications
- Profile picture upload (monogram fallback works)
- Cloud sync
- WebAuthn / Face ID (current passcode is PIN-only; biometric is a future addition)
- Automatic reading regeneration on every 10 new entries (currently manual rerun only)

**AI quality reality**: without `ANTHROPIC_API_KEY` in `.env.local`, the mock parser handles common cases ("had coffee with Maya", "with kate" lowercase, etc.) but still misses anything subtle. With the real key, Sonnet handles all of these correctly. There's a per-entry "change attribution" UI so users can correct misses, and those corrections feed back into future parse prompts as few-shot examples — so the mock gets noticeably more accurate after the user has done a few corrections.

---

## business model — currently undefined

No monetization, distribution, or marketing decisions have been made. The product is a self-funded prototype right now. Open questions a strategy conversation should engage with:

1. **Monetization model** — subscription (Day One $35/yr) vs. freemium (Letterboxd Pro $20/yr) vs. one-time vs. free + premium AI? The AI costs ~$0.005/entry parse + ~$0.05/reading; needs to be amortized somehow.
2. **Cold-start UX** — new user opens app, sees empty list. First-entry prompt mitigates partially. Track first-entry → first-ranked-friend conversion as leading retention indicator.
3. **AI attribution failure handling** — if Claude is wrong frequently, trust erodes fast. Override rate >30% means the prompt needs revision.
4. **Tag vocabulary** — the 10 paired dimensions are opinionated. Worth A/B testing free-form tags vs. fixed vocabulary once users exist.
5. **The Reading cringe risk** — AI personality summaries can land as insightful or invasive. Currently tuned observational. Worth user-testing with real entries before shipping widely.
6. **Privacy framing in marketing** — "I track my friends" reads cute to some, surveillance-y to others. Marketing copy should lean introspective ("learn what your friends mean to you") not data-collection ("we analyze your relationships"). This is a knife-edge.
7. **App name** — "folks" is the current working name. Predecessor was "Circle." Not yet validated against trademarks or domain availability.
8. **Distribution** — PWA-first means no app store gatekeeper but also no app store discovery. Where does the audience actually live? Twitter/X micro-influencers in the introspective-tech niche? TikTok? Substack?
9. **Comparison with adjacent products** — Dex (CRM-flavored, networking), Day One (journal), Reflectly (AI therapy-ish), BeReal (proximity, social), Co-Star (mystical), 1SE (video). folks sits at an unusual intersection; the positioning needs to land that nuance.

---

## success metrics (v1 targets)

| Tier | Metric | Target |
|------|--------|--------|
| Primary | D7 retention | 40%+ |
| Secondary | Avg entries / active user / week | 3+ |
| Tertiary | Avg tracked people / active user | 5+ |
| Quality | Crash-free sessions | 99.5%+ |
| AI quality | Attribution accuracy (manually sampled) | 85%+ |

---

## taste anchor

When in doubt, default to **less chrome, not more**. The home screen should look more like a Day One entry page than a Notion dashboard. Friend list rows should feel like lines in a notebook, not rows in a database. The mic FAB should feel like the only saturated thing on the screen. If you find yourself adding decorative elements, remove them. Restraint is the aesthetic.
