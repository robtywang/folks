# folks

> a journal for venting about the people in your life.

**Live:** [folks-five.vercel.app](https://folks-five.vercel.app)

folks is a voice-first AI journal. You vent about a friend, a parent, the person you're dating — it parses who you're talking about, remembers them across entries, and gives you an honest read on each relationship over time. Local-first by default; the AI sees text in flight but nothing leaves your device permanently.

---

## What it is, plainly

Open the app at 1am, tap the mic, say *"katherine cancelled again, third time this month, wondering if it's me."* folks pulls Katherine out of the sentence, looks up everything you've ever said about her, and replies like a friend who's been keeping track: *"jamie has that pattern of pulling away when work gets heavy. could be that? — what did she say when you brought it up?"*

That's the loop. Vent → folks reads → folks responds → entry saves to your journal. Over time, the friend-journal page for each person builds a sentiment chart, a Reading ("what folks has noticed"), and a chronological log of every entry that mentioned them.

The substitute behavior is the late-night text to a friend. The product is the private, always-available version that *remembers everything*.

---

## Tech stack

```
Framework:   Next.js 15.5 (App Router) + React 19 + TypeScript strict
Storage:     Dexie.js (IndexedDB) — all data local to device
AI:          @anthropic-ai/sdk
             · Sonnet 4.6 — entry parsing, "folks says" chat responses
             · Opus 4.7  — Reading synthesis, weekly recap
             · Haiku 4.5 — voice-transcript cleanup
Voice:       Web Speech API (in-browser)
Styling:     Tailwind CSS + CSS variables
Fonts:       Fraunces (Georgia fallback), JetBrains Mono — Google Fonts
Icons:       Tabler webfont, outline variants only
Animation:   Framer Motion
Deploy:      Vercel (auto-deploy on push to main)
PWA:         manifest.webmanifest + apple-touch-icon set
Auth:        None. Anonymous, device-local. Optional 4-digit passcode.
```

---

## Setup

```bash
# 1. Install
npm install

# 2. Add your Anthropic API key
cp .env.local.example .env.local
# edit .env.local: ANTHROPIC_API_KEY=sk-ant-...

# 3. Run dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Build / typecheck / lint:
```bash
npm run build
npm run typecheck
npm run lint
```

`.npmrc` has `legacy-peer-deps=true` (React 19 + a couple of libs need it).

---

## The four main screens

| Route | Purpose |
|---|---|
| `/` | Home. Compose surface: textarea + voice input + bottom CTA to journal. Top: people icon, folks wordmark, settings cog. |
| `/chat` | Full-screen vent surface. Opens from home with seed text. Voice auto-commits on silence; text uses an explicit send button. AI responds inline; sage-tinted typing dots while waiting. *Send to journal* compiles the conversation into a single first-person entry. |
| `/journal` | Reverse-chronological feed of every entry. Search bar (with inline coral highlighting on matches and on tracked names). Tap any entry to edit; delete is a two-tap coral pill at the bottom-left of the editor. |
| `/folks` | Per-friend list, sorted by most-recent activity. Each row: monogram, name, tone (warm / mixed / heavy) + entry count + last-seen. Tap to open that friend's journal. |
| `/person/[id]` | The friend journal. Monogram + name + relationship category. Sentiment analytic row. *What folks has noticed* — the AI's Reading. Sentiment tracker (smoothed curve over the last 16 entries, sage when warm, coral when heavy). Chronological entries about that person. |

Plus: `/write` (manual entry, skips AI), `/settings` (name / passcode / data export / dev tools), and a 7-screen onboarding for first-launch users.

---

## Architecture

```
app/
  page.tsx                # home (compose + entrance animation)
  layout.tsx              # root, fonts, manifest, passcode tracker
  chat/page.tsx           # the venting surface
  journal/page.tsx        # entry log + search + inline edit
  folks/page.tsx          # per-friend list
  person/[id]/page.tsx    # friend journal + sentiment tracker
  write/page.tsx          # manual entry (skip AI)
  settings/page.tsx       # name / passcode / data / dev
  onboarding/{1..7}/      # 7-screen first-launch flow
    page.tsx
    layout.tsx            # locks body scroll
  api/
    parse/                # Sonnet 4.6 — entry → primary_person + sentiment + tags
    folks-says/           # Sonnet 4.6 / Opus 4.7 — grounded chat response
    summarize-chat/       # Sonnet 4.6 — compile chat turns into a journal entry
    reading/              # Opus 4.7 — per-friend qualitative synthesis
    punctuate/            # Haiku 4.5 — voice-transcript cleanup
    status/               # health: { aiReady: boolean }

components/
  listening-bars.tsx      # animated audio meter (shared by home + chat)
  pin-pad.tsx             # passcode input (settings)
  lock-screen.tsx         # passcode gate on protected surfaces
  passcode-activity-tracker.tsx
  onboarding/             # ProgressDots, PillButton, PinKeypad, TypingDemo, FriendRow

lib/
  db.ts                   # Dexie schema + getMeta/setMeta + person lookups
  ai.ts                   # parseEntry (real + mock fallback) + correction memory
  save-entry.ts           # save / update / delete + closeness recompute
  closeness.ts            # background sentiment math (no UI display)
  reading.ts              # generateReading + saveReading
  lock.ts                 # PBKDF2 passcode hash, unlock state, useLockState
  session-prompts.ts      # time-of-day placeholder rotator on home
  seed.ts                 # /settings → "load test data" — 5 people, ~17 entries

types/index.ts            # Entry, Person, ParseResponse, Tag vocab
```

---

## Privacy commitments (user-facing)

- **Voice transcription is in-browser** (Web Speech API). Audio blobs never leave the device.
- **Default to local-only storage** (Dexie / IndexedDB). No cloud sync, no account, no backup we control.
- **Only entry text leaves device** — sent to Anthropic at parse / response time. Anthropic API defaults: no training on inputs, no retention past the request, no human review on the normal path.
- **One-tap export** from `/settings → data` (JSON of all entries + people).
- **One-tap wipe** from settings (clears Dexie + passcode + meta keys).

Marketing line: *we don't keep your entries. anthropic doesn't either. only your device does.*

---

## What's deferred

These exist in code (`lib/prompts.ts`, `lib/weekly-recap.ts`, `lib/insights.ts`, `app/api/prompts/`, `app/api/weekly-recap/`, `app/api/insights/`) but aren't surfaced anywhere in the UI right now. Either I'll wire them back in or strip them in the next cleanup pass.

- **Per-friend prompted questions** — Sonnet phrases statistically-detected patterns as soft questions ("what tends to be different about weekdays with maya?"). Built; not surfaced.
- **Weekly recap** — Sunday-morning Opus digest of the week's social shape. Built; not surfaced.
- **Pattern insight cards** — observational layer on the friend journal. Built; removed from UI pending the friend-journal redesign.

---

## Known limitations

- Voice input requires a Chromium-based browser or Safari. Firefox has no Web Speech API.
- iOS Safari needs HTTPS for `getUserMedia` — works on Vercel, not on `localhost` from a phone.
- IndexedDB clears in incognito / private mode.
- Without `ANTHROPIC_API_KEY` set, the parser falls back to a heuristic mock — fine for UI testing, not for evaluating the actual AI voice.
- Passcode is unrecoverable. Forgetting it = factory wipe of all entries.

---

## Roadmap to v1.1

In order:

1. Dead-code cleanup (prompts / weekly-recap / insights routes + libs)
2. Privacy policy at a stable URL (required for App Store)
3. Capacitor wrap pointing at the Vercel URL
4. Xcode signing + TestFlight upload
5. Beta with 10-15 friends for two weeks
6. Fix what breaks
7. App Store submission

---

## License + ownership

Private repo, not open-source. Author: Arthur (arthurwangtennis@gmail.com).
