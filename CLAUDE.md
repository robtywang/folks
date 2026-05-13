# Circle — friends tracker app

A voice-first friends tracker that uses AI to surface who your real best friends are based on what you log about your interactions. Positioned as a **friends tracker, not a journal app**. The journal-style input is the mechanism, the ranking is the product.

Pitch: *"Find out who your real best friends are."*

---

## Product thesis

User opens the app → lands on a compose surface → types or talks about whatever just happened → AI extracts who it's about, sentiment, and tags → a ranked list of friends emerges below, sorted by closeness. Over time the rankings reveal who they're actually investing in vs. who they think they are.

**Target user**: 22–32 year olds who use Letterboxd, Co-Star, BeReal, Day One. Introspective about social patterns. Want data, not therapy.

**Anti-personas**: people wanting actual deep journaling (use Day One), people wanting therapy-style commentary (use Reflectly), people building a CRM for networking (use Dex).

---

## Core flows

1. **Logging**: user taps mic or types → AI parses entry → attribution chip appears → save
2. **Ranking**: closeness algorithm recomputes on every save → friends list re-orders → trend indicators update
3. **Editing**: any AI-inferred field is tappable → user can correct → AI re-runs if text changes

---

## Screens

### 1. Home (compose-first, scrollable)
- Top bar: wordmark left, book icon + gear icon right
- Date display (italic serif, prominent)
- **Compose surface** at top — large card styled as paper, italic placeholder, mic icon inside the card. Tap → full-screen compose
- Section break: hairline + "your circle" label
- **Ranked friends list** below: each row = serif name + mono score + ▲/▼ trend. Tap row → expands inline
- Scroll further: recent entries section (chronological feed of last 3–5 entries)

### 2. Compose state (full-screen, triggered by tapping compose card or mic)
- Live voice transcript renders as user speaks
- REC indicator + stop button if recording
- AI attribution chip slides in mid-compose ("Logging to Maya · change")
- Save button bottom-right, Cancel × top-left

### 3. Journal sheet (book icon → bottom sheet, full-height capable)
- Chronological feed of all entries
- Filter pills: All / by Person / Solo
- Search affordance
- Tap entry → entry detail
- Swipe down to dismiss

### 4. Person profile (drill in from any friend row)
- **Header**: profile picture (uploadable, falls back to color-hashed monogram), serif name, italic relationship label, pin + mute icons
- **Stats row**: total entries, avg sentiment, closeness score (large), trend, last seen
- **The Reading card**: 1–3 sentence italic serif AI summary, rerun button
- **Entry timeline**: each entry broken down with date, full text, sentiment chip, tag chips
- **Actions menu**: merge, mute, delete
- "Log new for [name]" CTA

### 5. Entry detail (tap any entry)
- Date + exact time
- Full text or transcript
- Audio playback if voice
- Editable: text, attribution chip, sentiment slider, tag chips
- Delete with 5-second undo

### 6. Settings (gear icon)
- Account, privacy, AI behavior thresholds, voice language, data export, data delete

### 7. Onboarding (first run only)
- 2 intro screens, skippable
- Mic + notification permissions
- First-entry prompt seeds the empty state

---

## Aesthetic: "stripped quiet" with journal flavor

Reference apps: Day One (spareness), Letterboxd (tracker structure), Co-Star (literary brevity moments).

### Palette
```css
--bg-cream:        #FAF7F0;  /* warm cream, not white */
--ink-primary:     #1F1A14;  /* warm black */
--ink-secondary:   #8C7E5C;  /* mid tan */
--ink-tertiary:    #B4A689;  /* light tan */
--border-hair:     #D9CFBC;  /* hairline borders */
--accent-coral:    #C8553D;  /* primary action, negative deltas */
--accent-sage:     #6F7D63;  /* positive trends */
```

### Typography
- **Display & body**: Fraunces (serif). Weights 400 and 500 only. Italic for prompts and special moments.
- **Numbers & metadata**: JetBrains Mono. Weights 400 and 500 only.
- Load via Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### Layout
- 16px horizontal padding throughout
- 8–16px vertical rhythm
- Hairline borders (0.5px solid var(--border-hair)) for the few dividers needed
- **No double rules, no dashed dividers, no chip badges, no sparklines in v1**
- Single coral accent point per screen (the mic action)

### Iconography
- **Tabler outline icons only**, never filled variants
- 14–18px in nav, 16–18px in primary actions, 22px in FAB
- Webfont via: `https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css`

### What this aesthetic explicitly is NOT
- Not a masthead-driven publication aesthetic
- Not dark mode (defer to v2)
- Not heavy on chip badges or sparklines (defer to v2 once we know what users want surfaced)
- Not cute, twee, or cottagecore
- Not aggressively designed

---

## AI pipeline

### Per-entry parsing (Claude Sonnet 4.6)

Single API call per entry. ~500 tokens in, 200 out. Cost: ~$0.005/entry.

**Prompt template:**
```
You parse entries for a friends-tracker app.

EXISTING PEOPLE IN USER'S CIRCLE:
{list of {name, relationship, entry_count, avg_sentiment}}

USER'S ENTRY:
"{entry text}"

Return JSON only:
{
  "primary_person": "<existing name>" | "<new name>" | null,
  "is_new_person": boolean,
  "confidence": 0.0-1.0,
  "is_solo": boolean,
  "sentiment": 1-10,
  "tags": [from fixed vocabulary, max 3],
  "additional_people": [string],
  "context_summary": "short phrase"
}

Tag vocabulary (paired): energizing/draining, vulnerable/guarded,
present/distant, warm/cold, supportive/exhausting, fun/boring,
calm/anxious, honest/performative, generous/transactional, easy/effortful.

Return empty tags array if unsure. Return null primary_person and is_solo: true 
if the entry is about the user alone (no specific person involved).
```

**Confidence thresholds:**
- `> 0.85`: auto-attribute, show "Logging to X · change"
- `0.5 – 0.85`: soft prompt "Maybe X? Confirm or pick"
- `< 0.5`: explicit picker before save

**Person emergence:**
- New name + confidence > 0.7 → store as transient (in entries DB but not in people DB)
- Second distinct mention of same name → promote to real person, toast "Added X to your circle · undo"

### Personality summary / "The Reading" (Claude Opus 4.7)

Runs on the person profile. Aggregates all entries about a person, generates 1–3 sentence personality summary in italic serif voice.

- Generates when person has 5+ entries
- Auto-regenerates every 10 new entries about them
- User can manually rerun via "Rerun ↻" button
- Cost: ~$0.05 per generation (rare enough)
- ~3000 tokens in (entries), 500 tokens out

**Tone guidance baked into prompt**: observational, never advisory. "Maya tends to be present in slow moments, quieter when stressed." Never "you should reach out to Maya more."

---

## Closeness algorithm (local, no API)

Runs on every save. Pure local compute.

```typescript
function closeness(person: Person, entries: Entry[]): number {
  const recent = entries
    .filter(e => e.personId === person.id)
    .filter(e => daysSince(e.createdAt) <= 90)
  
  if (recent.length === 0) return 0
  
  // 1. Recency-weighted sentiment (30-day half-life)
  const weights = recent.map(e => Math.exp(-daysSince(e.createdAt) / 30))
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const weightedSentiment = recent.reduce(
    (sum, e, i) => sum + e.sentiment * weights[i], 0
  ) / totalWeight
  
  // 2. Frequency factor (caps at 10 entries)
  const freqFactor = Math.min(recent.length / 10, 1.0)
  
  // 3. Variety factor (distinct tag combinations / 5, capped at 1)
  const tagCombos = new Set(recent.map(e => e.tags.sort().join(',')))
  const variety = Math.min(tagCombos.size / 5, 1.0)
  
  // 4. Composite
  return clamp(
    weightedSentiment * 0.6 +
    freqFactor * 3 +
    variety * 1,
    0, 10
  )
}

function trend(person: Person, entries: Entry[]): number {
  return closeness(person, entries) - closenessAt(person, entries, daysAgo(7))
}
```

Tunable parameters (post-launch A/B):
- Recency decay (30-day half-life default)
- Frequency cap (10 entries)
- Sentiment-vs-frequency weight (0.6 vs 3.0)

---

## Data model

```typescript
interface Entry {
  id: string                  // UUID
  createdAt: number           // unix ms
  updatedAt: number
  text: string                // user-written or transcribed
  audioBlob?: Blob            // local-only, never uploaded by default
  personId: string | null     // null = solo entry
  sentiment: number           // 1-10, from AI
  tags: string[]              // max 3, from fixed vocabulary
  aiConfidence: number        // 0-1
  userConfirmed: boolean      // controls sparkle indicator
  additionalPeople?: string[] // secondary people mentioned
}

interface Person {
  id: string
  createdAt: number
  name: string
  nickname?: string
  relationship?: string       // "close friend", "ex", "coworker", etc.
  profilePicture?: string     // base64 or blob URL, local
  closenessScore: number      // computed, cached, recomputed on save
  closenessTrend: number      // delta vs 7 days ago
  lastInteraction: number     // timestamp
  entryCount: number          // cached
  avgSentiment: number        // cached
  muted: boolean
  pinned: boolean
  readingText?: string        // AI personality summary
  readingUpdatedAt?: number
  isTransient: boolean        // true if only 1 mention so far
}

interface User {
  id: string
  createdAt: number
  voiceLanguage: string       // default "en-US"
  attributionThreshold: number // default 0.75
  notificationPrefs: {
    weeklyRecap: boolean
    dailyPrompt: boolean
  }
}
```

---

## Tech stack (committed)

- **Framework**: Next.js 15 (App Router) — PWA-first
- **Styling**: Tailwind CSS + CSS variables for the palette
- **Local storage**: IndexedDB via Dexie.js (clean API for the data model above)
- **AI**: Anthropic SDK (`@anthropic-ai/sdk`)
- **Voice**: Web Speech API (browser-native, client-side)
- **Icons**: Tabler Icons webfont
- **Fonts**: Fraunces + JetBrains Mono via Google Fonts
- **Deployment**: Vercel (free tier sufficient for v1)
- **Auth**: skip for v1, everything local. Add Supabase Auth in v2 when sync becomes a need.
- **Cloud sync**: NOT in v1. v2 will use Supabase with client-side encryption.

---

## Privacy commitments (these are user-facing promises)

- **Voice transcription is on-device**. Web Speech API runs in the browser, audio never leaves the device by default.
- **Default to local-only storage**. IndexedDB on the user's device. Cloud sync is explicit opt-in (v2).
- **Only transcript text gets sent to Anthropic** for AI parsing. Audio blobs stay local.
- **No social features in v1**. No sharing, no friend-of-friend, no public profiles, no exports of other people's names.
- **Data export**: one-tap JSON dump from settings.
- **Data delete**: irreversible delete on demand, two confirmations.

---

## v1 scope (build) vs v2+ (cut)

### Build (v1)
- Compose-first scrollable home with friends ranking below
- Voice + text logging
- AI parsing pipeline (Sonnet 4.6)
- Closeness algorithm
- Person profiles with profile picture upload, stats, Reading card, entry timeline
- Entry detail + edit
- Journal sheet (bottom sheet from book icon)
- Settings
- Onboarding (2 screens + first-entry prompt)
- PWA install prompts

### Cut from v1 (deliver in v2+)
- Dedicated Insights tab → instead, weekly recap delivered as push notification + single card on home Sundays
- Wrapped-style year-end recap
- Cloud sync (local-only in v1)
- Native iOS — ship PWA first
- Place/activity tagging
- Photo attachments to entries
- Multi-language beyond English
- Social/sharing features
- Auth (everything anonymous + local in v1)

---

## Coding conventions

- **TypeScript strict mode**. No `any` without explicit comment justifying it.
- **Functional components only**. No class components.
- **File naming**: kebab-case for files, PascalCase for components.
- **Folder structure**:
  ```
  /app                  # Next.js app router pages
  /components           # React components
  /lib
    /ai                 # Claude API integration
    /db                 # Dexie schemas + queries
    /closeness          # algorithm
  /styles
  ```
- **State management**: React state + Dexie reactive queries via `useLiveQuery`. Don't reach for Redux/Zustand unless we hit a real wall.
- **Animations**: CSS only where possible. Framer Motion if needed for the bottom sheet.
- **No external UI libraries** (no shadcn, no MUI). Hand-build to maintain aesthetic control.
- **Accessibility**: ARIA labels on all icon-only buttons. Semantic HTML. Color contrast ≥ 4.5:1 for body text.

---

## Important rules for the agent

- **DO NOT** add features outside v1 scope without flagging it explicitly
- **DO NOT** introduce competing aesthetic patterns. If unsure, default to *less* chrome, not more.
- **DO NOT** use generic AI-coded styling (purple gradients, Inter font, glassmorphism, default shadcn). The aesthetic is specific.
- **DO NOT** use emoji in UI. Tabler outline icons only.
- **DO NOT** add dark mode in v1.
- **DO NOT** ship to native iOS in v1. PWA only.
- **DO** ask before changing the closeness algorithm parameters
- **DO** preserve the privacy commitments (local-first, on-device transcription)
- **DO** use the exact palette and typography defined above
- **DO** keep total bundle size small — this is a daily-use app, must load fast

---

## Build commands (placeholder until project is initialized)

```bash
# Setup (run once)
npx create-next-app@latest circle --typescript --tailwind --app
cd circle
npm install dexie dexie-react-hooks @anthropic-ai/sdk

# Dev
npm run dev

# Build
npm run build

# Type check
npm run typecheck
```

---

## Success metrics (v1)

| Tier | Metric | Target |
|------|--------|--------|
| Primary | D7 retention | 40%+ |
| Secondary | Avg entries / active user / week | 3+ |
| Tertiary | Avg tracked people / active user | 5+ |
| Quality | Crash-free sessions | 99.5%+ |
| AI quality | Attribution accuracy (manually sampled) | 85%+ |

---

## Open product questions (deferred)

These are real decisions still on the table — flag if working on adjacent code:

1. **Cold start UX**: new user opens app, sees empty list. First-entry prompt mitigates partially. Track first-entry → first-ranked-friend conversion as leading retention indicator.
2. **AI attribution failure handling**: if Claude is wrong frequently, trust erodes fast. Track manual-override rate. If >30% of entries get overridden, prompt needs revision.
3. **Tag vocabulary**: 10 paired dimensions is opinionated. Worth A/B testing free-form tags vs. fixed vocabulary once we have users.
4. **The Reading card cringe risk**: AI personality summaries can land as insightful or invasive. Currently tuned observational. Worth user-testing with real entries before shipping widely.
5. **Privacy framing in marketing**: "I track my friends" reads cute to some, surveillance-y to others. Marketing copy should lean introspective ("learn what your friends mean to you") not data-collection ("we analyze your relationships").
6. **App name**: "Circle" is a working placeholder. Needs a real decision before launch.

---

## What good looks like (taste calibration for the agent)

When in doubt, the home screen should look more like a Day One entry page than a Notion dashboard. The friends list rows should feel like lines in a notebook, not rows in a database. The mic FAB should feel like the only saturated thing on the screen. If you find yourself adding decorative chrome, remove it. Restraint is the aesthetic.

*— end of CLAUDE.md*
