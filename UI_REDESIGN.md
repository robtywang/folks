# folks — UI Redesign Brief

*Companion to PIVOT.md. PIVOT.md decides what folks is. This doc decides what folks looks like and how it behaves screen-by-screen.*

*Status: living document. Last updated 2026-05-14.*

---

## The audience and the substitute behavior

> folks is for people who currently **vent to friends, gossip in group chats, or text someone at 11pm to process relationship drama** — but want a private, always-available, advice-giving alternative that *remembers everything you said about everyone*.

Every UI decision has to reinforce that. The textarea is where you come to vent. The "folks says..." block is where you get advice back. The profile is the AI's memory of each person you've vented about. The journal is the receipt.

If a screen doesn't serve that loop, it's chrome and should be cut.

---

## Design principles (in addition to existing aesthetic)

The cream/Fraunces/Tabler aesthetic from CLAUDE.md still holds — *don't introduce competing visual patterns.* The new principles for the redesigned product:

1. **The AI's response is the centerpiece of every entry.** Not a sidebar, not an optional tap, not a separate page. The "folks says..." block lives inside the detection card after every save and is the first thing the eye lands on.
2. **Every person you write about becomes a living artifact.** Profile pages are not utility pages — they're the memory of the relationship. Each profile should feel distinct on sight.
3. **Restraint over chrome, always.** Visual richness comes from typography and a single accent (coral or sage per page), not from cards, gradients, or chrome.
4. **The product is bounded.** No free-form chat. Every AI response is grounded in the user's corpus about a specific person. If the AI doesn't have enough corpus, it says so.
5. **Privacy reads as a feature, not a footnote.** The honest framing ("we don't keep your entries, anthropic doesn't either, only your device does") shows up in onboarding, settings, and the empty state of the AI.

---

## Information architecture

The current top-bar is: `/ratings` (left) · folks · `/journal` (right) + `/settings`.

The new top-bar collapses to:

```
[your folks ↓]      folks       [journal]    [settings]
```

- **Left:** "your folks" — opens a dropdown or panel listing all people you've written about. Replaces /ratings as a dedicated tab. Sorted by recent activity, not closeness score (the score still computes in the background but is not displayed).
- **Center:** "folks" — the wordmark, taps to home.
- **Right:** journal (the receipt of all entries) + settings.

The /ratings page itself still exists but is reached via "see them all" inside the "your folks" panel. It's a private deep-dive surface, not a top-level destination.

---

## Page-by-page redesign

### Onboarding (4 screens)

**Screen 1.**
> folks
>
> *relationships are hard. folks makes it easier.*

**Screen 2.**
> *write about anyone — your mom, the person you're into, the coworker who drains you.*
>
> *folks keeps notes and reads them back to you with suggestions.*
>
> *(demo loop: an entry appearing → a "folks says..." block fading in beneath it)*

**Screen 3.**
> yours, only.
>
> *no account. no cloud. no backups.*
>
> *the ai reads each entry in flight — anthropic doesn't keep it, doesn't train on it. only your device does.*
>
> *(passcode pad)*

**Screen 4.**
> *okay.*
>
> *who's been on your mind?*
>
> *(drops to compose with that as the placeholder)*

The single tonal shift across the four screens is from external promise → demonstration → privacy → invitation. No contradiction. No "just journal" reversion.

### Home

Stays compose-first. Three changes:

1. **Textarea placeholder rotates between a handful of "who's on your mind?" variants.** Currently it's "how was today?" / "what's keeping you up?" — keep some, but add: "who's been on your mind?", "anything you want to talk through?", "vent something." The journal-coach voice stays. The bias shifts toward people.
2. **"noticed" indicator below compose reframes** from "noticed N things in your journal" to "**folks has thoughts on 3 people →**". Same link, sharper copy.
3. **Weekly recap card** (when present) stays. Same dismissable card, same aesthetic.

What stays untouched: date display, last-entry indicator, first-stable line, the entire compose interaction.

### Detection card (after save) — the centerpiece change

Current order:
1. attribution
2. low-confidence prompt (if needed)
3. clash picker (if needed)
4. feedback check-in (if heavy)
5. sentiment slider
6. tags
7. engine/confidence footer

New order:
1. attribution
2. **folks says...** ← *the new section, becomes the visual anchor*
3. low-confidence prompt (if needed)
4. clash picker (if needed)
5. feedback check-in (if heavy)
6. sentiment slider — *collapsed by default, expandable*
7. tags — *collapsed by default*
8. engine/confidence footer — small

**Visual treatment of the "folks says..." block:**

```
─────────────────────────────────
DETECTION
logged to maya · change

folks says
based on seven entries about maya:
the late dinners and morning coffees aren't ambiguous to me —
she's been actively seeking you out for two months.
the next move is yours.

—  sentiment + tags (collapsed)  ↓
─────────────────────────────────
```

- Block sits inside the existing sage-bordered detection card but with **stronger visual hierarchy**: a 14-15px italic Fraunces body, generous line-height, ~3 lines of breathing room above and below.
- Label "folks says" sits in mono uppercase as a label, same as "DETECTION" / "SENTIMENT" / "TAGS".
- No quote marks around the response — it reads as the AI's voice, not a citation.
- Empty state (first entry on a new person): *"i don't know maya yet. write a few more entries and i'll start noticing things."*
- Long-corpus states (10+ entries on the same person): the response can run longer and reference cross-entry patterns ("you mentioned her brother in two recent entries — that's new").
- Severity-3 entries: the AI does NOT advise; surfaces resources ("what you wrote concerns me. here's a hotline if you need to talk to someone.").

**Sentiment + tags collapse:**

Today these are always shown. Going forward they're collapsed under a chevron — they're metadata, not the point. Users who want to recalibrate the AI's sentiment read can expand.

### Profile page — the living artifact

This is the biggest visual change. Each profile becomes the relationship's "card."

**New section order:**

1. **The Card (header)** — replaces the current identity block
2. **Ask folks about [name]** — narrow Q&A input
3. **The Reading** — qualitative AI synthesis of the person
4. **folks says (recent)** — pinned AI advice from recent entries, scrollable
5. **Entries** — the journal timeline for this person
6. **Cadence footer** — last logged + interval

What gets cut from current profile:
- Trajectory chart (gone)
- Sentiment trend chart (already gone)
- Pattern insight cards (already gone, subsumed)
- Rank chip
- Per-entry closeness impact badges
- "Trending down" warning line

**The Card (new header treatment):**

```
─────────────────────────────────
                 ┌─┐
                 │M│  ← monogram in a 70-80px circle
                 └─┘     subtle color tint pulled from relationship sentiment:
                            warm coral wash for someone you love
                            cool sage for an easy friend
                            faded ink-tertiary for someone drifting
                            muted coral for someone "complicated"

              maya
              close friend  ← relationship category, italic

       vulnerable · honest · present  ← top 3 tags, italic chips

       ╭─╮╭─╮╭╮╭─╮  ← optional: faint sentiment wave (horizontal arc)
       ────────────     over time, watercolor not chart-like

─────────────────────────────────
```

The card is the answer to "stores visual stuff per person." It's auto-generated from the corpus — no manual photo upload, no curation. The user opens a profile and feels they know the *shape* of the relationship at a glance.

The color tint is the most important new element. It gives each profile its own *feel* without adding chrome. Two people in your folks list shouldn't look identical even before you read the names.

**Ask folks about [name] — bounded Q&A:**

A single-line input below the Card, with a label "ask folks about maya":

```
─────────────────────────────────
ASK FOLKS ABOUT MAYA

  ▢ should i text her back?                            →
─────────────────────────────────
```

- Pressing return / arrow → calls /api/ask-folks with the question + Maya's corpus.
- Response renders inline below the input, italic Fraunces, ~3-5 sentences.
- Last response stays visible until dismissed or replaced.
- Suggested seed questions appear faintly below the input until the user starts typing: *"why do we always fight on sundays?"* / *"is this going anywhere?"* / *"what would she want here?"*
- Bounded: if the user asks something the corpus can't answer ("what's maya's last name?" when it's never been mentioned), the AI says so honestly.

This is the core "advice-giver" surface. It's the closest folks ever gets to a chatbot, but it's narrow (one person, one question, grounded response).

**The Reading:**

Stays mostly as-is. Becomes longer-form when called — the AI has permission to write 4-6 sentences instead of the current 1-3. Acts as the "who is this person and what's going on with you and them" summary that persists between sessions.

**folks says (recent):**

A short scrollable list (or carousel) of recent "folks says..." responses from entries about this person. Lets the user revisit advice they got earlier without scrolling back through entries. Each item shows: the response + the date + tap → the entry it came from.

**Entries:**

The timeline of all entries about this person. Less prominent than current treatment (no more impact badges, no more closeness deltas). Just the writing, in reverse chronological order.

**Cadence footer:**

Stays. "last logged 3d ago · typically every 5 days · 23 entries total."

### Journal page (the receipt)

Currently: search bar + grouped daily entries with the "noticed" section at top.

Changes:

1. **"noticed" section reframes** from observational questions to advice-flavored prompts. Same surface, sharpened copy: *"folks noticed maya came up a lot this week — want to talk it through?"* Tap → home with prompt loaded.
2. **No other structural changes.** The journal is the receipt of everything you've written. It stays the way it is.

### Your folks (replaces /ratings as a destination)

Currently `/ratings` is a top-bar destination showing ranked + forming sections with closeness scores.

New behavior:

- Top-bar "your folks" opens a **panel/dropdown** (not a full page) listing everyone you've written about, sorted by **most recent activity** (not closeness).
- Each row: monogram + name + last logged + a 1-line summary from the Reading.
- Tap → opens that profile.
- At the bottom: a quiet link *"see them all →"* that opens the full ranked /ratings page, which still exists as a private deep-dive surface but is no longer a top-bar destination.

This means:
- Day-to-day, the user navigates to profiles via the panel (recent activity).
- The ranking is preserved for users who want to see it but never pushed at them.

### Settings

No structural change. Copy updates:
- "about" section: update version blurb to reflect new positioning.
- "developer" section: keep dev triggers for recap + prompts.
- "data" section: ensure delete-all confirms with new framing ("erase everything folks has read").

---

## Component-level changes

### Components to update
- `components/compose-card.tsx` — collapse sentiment + tags by default; integrate folks-says block in detection card
- `components/sentiment-slider.tsx` — used in collapsed state, no change
- `app/person/[id]/page.tsx` — full redesign per "Profile page" above
- `app/page.tsx` — placeholder rotation, copy update on noticed indicator
- `app/journal/page.tsx` — copy update on noticed section
- `app/onboarding/{1,2,3,4}/page.tsx` — full copy rewrite per "Onboarding"
- `app/ratings/page.tsx` — becomes the deep-dive linked from "see them all"

### Components to add
- **The Card** — new header component for profile, encapsulates monogram tint + qualities + sentiment wave
- **Ask folks input** — single-line input + response renderer for bounded Q&A
- **folks-says block** — the AI response surface that lives in the detection card AND on the profile

### Components / styles to delete
- `components/sentiment-trend.tsx` (already not rendered, can be deleted)
- `components/sparkline.tsx` (unused after trajectory removal)
- All "rank chip" / "trajectory card" styling in profile
- Per-entry closeness impact badges

---

## What stays untouched

- The cream / Fraunces / Tabler aesthetic system in `app/globals.css`
- Phone-frame chrome and scroll lock architecture
- Passcode lock + every-time / this-session unlock modes
- Voice transcription + punctuation flow
- Save-entry pipeline, parse pipeline, closeness math (closeness moves to background)
- All Dexie schemas
- The `weeklyRecaps` and `friendPrompts` tables and their flows

---

## Backend changes implied by this redesign

These are not UI but are required to ship the redesign:

1. **New `/api/folks-says` endpoint** — takes the just-saved entry + person's corpus → returns a 3-sentence grounded response. Sonnet 4.6 baseline; Opus for users with 10+ entries on the person.
2. **New `/api/ask-folks` endpoint** — takes a free-form question + person's corpus → returns a bounded grounded answer. Sonnet 4.6.
3. **Severity-3 guardrail** — hardcoded server-side check before any "folks says" / "ask folks" response. If `entry.severity >= 3`, return safety template, do not call Claude.
4. **The Card visual generator** — local code derives color tint + 3 top qualities from the person's corpus. No API call; cheap and instant.

---

## Open questions

These need decisions before we start building:

1. **The Card color tint** — auto-derived from sentiment + relationship category, or hand-pickable by the user? Auto is more on-brand (no manual curation) but more error-prone.
2. **Ask folks input — always visible on profile, or revealed by tap?** Always-visible is more discoverable but also more pressure ("ask me something"). Tap-revealed is quieter but easier to miss.
3. **folks says block on profile — separate section or absorbed into the Reading?** Both are LLM-generated summaries of the relationship. Could be unified.
4. **"Your folks" dropdown vs full page** — current proposal is a dropdown panel for daily nav with deep-dive page underneath. Verify that dropdown UX works on mobile (it usually doesn't without care).
5. **Voice for "folks says" — first-person or impersonal?** Current Reading is third-person observational. "folks says" leans first-person ("i see..." / "i notice..."). Pick one voice and stick to it.

---

## Definition of done

The UI redesign is "done" when:

- All four onboarding screens read aloud as a coherent pitch
- The detection card after save shows "folks says..." as its primary surface, every time
- Each profile page is visually distinct from every other profile (color tint + tags + wave)
- /ratings is no longer a top-bar tab; "your folks" replaces it as a panel
- Trajectory, sentiment chart, insight cards, rank chips, impact badges are all gone
- A new user can describe the product in their own words after onboarding ("it gives you advice on the people in your life") without prompting
