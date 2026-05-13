# Circle — friends tracker prototype (v0)

Voice-first friends tracker. Type or speak about your day, AI extracts who it's about, a ranked friends list emerges by closeness.

See `/CLAUDE.md` for full product spec. See `/.cursorrules` for agent rules.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Add your Anthropic API key
cp .env.local.example .env.local
# then edit .env.local and paste your key

# 3. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the home screen with the compose card and an empty "your circle" section.

## Try the core flow

1. Type something like *"had coffee with Maya, she was really present today"* in the compose card
2. Tap **save →**
3. Watch the result toast: *"logged to Maya · added to your circle"*
4. Maya appears in the ranked list below
5. Tap her row to expand and see the entry

Try a few more entries — same person, different person, a solo entry like *"studied at home for 3 hours"* — and watch the rankings update.

## Without an API key

The prototype falls back to a heuristic mock parser if `ANTHROPIC_API_KEY` is unset or invalid. It uses simple regex matching on capitalized words for attribution and word-list sentiment scoring. Good enough for testing the UI flow before you commit to API costs.

## File structure

```
app/
  layout.tsx              # root layout, font loading
  page.tsx                # home screen
  globals.css             # palette + base styles
  api/parse/route.ts      # server-side Claude API proxy

components/
  compose-card.tsx        # the paper-styled compose surface
  friend-row.tsx          # one row in the ranked list

lib/
  db.ts                   # Dexie schema
  ai.ts                   # client-side AI call with mock fallback
  closeness.ts            # local closeness algorithm
  save-entry.ts           # orchestrator: parse + persist + recompute

types/
  index.ts                # TypeScript interfaces + tag vocabulary

.cursorrules              # rules for Cursor agent
CLAUDE.md                 # full product spec (place at root)
```

## What's NOT in v0

Per CLAUDE.md, these are deferred to later builds:

- Person profile screen (only ranked list + inline expansion in v0)
- Journal sheet (book icon top-right is decorative for now)
- Settings (gear icon decorative for now)
- Entry edit / delete
- Onboarding
- Voice transcription state polish (recording animation, etc.)
- PWA install / offline support
- Cloud sync

Build these in order based on whichever flow you hit first while using the prototype yourself.

## Known issues / TODOs

- Voice input falls back to text-only in browsers without Web Speech API (Firefox)
- IndexedDB clears on incognito/private mode by default
- The mock parser is intentionally dumb — don't tune confidence thresholds against it
- No error boundary yet; if Claude returns malformed JSON, the user sees a console error

## Next steps after v0

1. Build the person profile screen (drill in from `FriendRow`'s "see all →")
2. Add the journal sheet (bottom sheet from book icon)
3. Polish the recording state in `compose-card.tsx`
4. Add entry edit/delete to expand the row's interaction model
5. Build onboarding flow for first-run users
