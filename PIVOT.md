# folks — Product Pivot Brief

*This doc captures the strategic pivot decided on 2026-05-14. It supersedes earlier positioning in CLAUDE.md. Paste at the top of any new Claude conversation working on folks.*

---

## TL;DR

**Pitch:** *"relationships are hard. folks makes it easier."*

**Tagline (longer):** *talk about your friendships, your mom, the person you're dating, the coworker who drains you. folks keeps notes for you and gives you suggestions. it's not a therapist. it's a smart friend who's read your diary and remembers everything.*

**Mechanic:** you write an entry about someone → folks reads it alongside every prior entry about that same person → the detection card returns a grounded "folks says..." response that names what's going on and suggests a possible move. The journal is the input. The AI's reading-of-your-corpus is the output. Same compose flow, no new screens, no chatbot mode.

**Why this version of the product:** It solves an actual ache ("I don't know what's going on with this person") instead of satisfying a curiosity ("who's my real best friend?"). The ache returns every time the user thinks about anyone in their life — friend, family, partner, ex, coworker — which gives folks a built-in retention loop: every entry produces a useful response in three seconds.

**Who it's for:** people who currently vent to friends, gossip in group chats, or text someone at 11pm to process relationship drama. folks is the private, always-available, advice-giving alternative that *remembers everything you said about everyone*. The behavior being replaced isn't "journaling" — it's the late-night call to a friend to talk through your mother / partner / coworker / the person you're into. That's the substitute pattern, and that's where the retention comes from.

**What it isn't:** Not a therapist (no diagnoses, no clinical claims, prominent disclaimer). Not a chatbot (every response is bounded by your corpus). Not a CRM (no scheduling, no contact management). Not a social network (no sharing, no friend-of-friend graph). Closest precedents: Reflectly, Wysa, Co-Star — all of which sit in the "AI-augmented self-reflection" space without claiming clinical authority.

---

## How we got here

The strategic conversation walked through three competing jobs-to-be-done:

1. **"Letterboxd for friendships"** — the ranking IS the product, journal text is metadata input. (Original CLAUDE.md positioning.)
2. **"Co-Star for relationships"** — the AI reads you back to yourself. Observational.
3. **"Day One with relationship memory"** — habit-first journal with an AI sidekick that remembers context.

All three were rejected on retention grounds:

- Job 1 satisfies curiosity, not need. Why open it on day 30?
- Job 2 has a cold-start problem. The AI can't notice patterns until ~20 entries land. Users churn before the magic appears.
- Job 3 is mostly Day One's territory. The AI is supporting, not the moat.

The fourth option emerged from the user's own pitch: **"the textbox acts as both a journal and an AI that gives advice on the people in your life."** This is the one that has:

- An ache (people want answers about specific relationships, not abstract patterns)
- Immediate payoff on entry 1 (advice is grounded in the single entry plus any priors)
- A real moat (no other AI app has read 30 entries about your specific mom / partner / crush)
- A use case anyone repeats verbally: *"it tells you what's actually going on with the people in your life."*

---

## The core mechanic

The compose flow stays exactly as it is. The change is in the **detection card** that appears after save.

Current detection card:
- attribution (logged to Maya · change)
- sentiment slider
- tags
- AI engine + confidence footer

New detection card adds one section: **folks says...** A short grounded response from Claude, drawing on every prior entry about that person plus the just-saved entry. Phrased as observation + possible move, never prescription.

Example:

```
─────────────────────────────────
DETECTION
logged to maya · change

folks says
based on seven entries about maya:
the late dinners and morning coffees aren't ambiguous to me —
she's been actively seeking you out for two months.
the next move is yours.

sentiment ● ● ● ● ● ● ● ● ○ ○ (8)
tags  vulnerable · honest
─────────────────────────────────
```

This is the single most important UI change. Everything else flows from it.

---

## What stays

- The compose-first home screen and voice flow
- The closeness algorithm (now invisible plumbing — it informs the AI about who matters, weights the corpus, drives prompt selection)
- The privacy story (storage local, inference in-flight, no retention on Anthropic's side)
- The aesthetic (cream, italic Fraunces, Tabler outline, restraint)
- Per-person profile pages (now the natural place for deep "ask folks about X" interactions)
- Weekly recap (kept as a Sunday ritual)
- The Reading per person (kept — it's the "long-form folks says")
- Passcode lock + local-only storage

## What changes

- **Detection card** gains the "folks says..." section as the primary new surface.
- **Profile pages** add an "ask folks about [name]" input — narrow Q&A grounded in entries about that person. Not a chatbot, not free-form. Bounded by the corpus.
- **Onboarding** is rewritten to pitch the new use case (see below). Today's onboarding contradicts itself — three screens promise ranking, the fourth promises generic journaling.
- **The "noticed" feed in /journal** stays but reframes: from "patterns we observed" to "questions worth asking folks about."
- **Home indicator** stays but reframes from "noticed N things" to "N folks reading something for you."
- **Closeness score becomes invisible.** No more rank chip on profile, no more per-entry impact badges. The math runs in the background to weight the AI's attention but the user never sees a number.

## What gets cut

- **The /ratings page becomes secondary.** Still accessible but not a destination tab — maybe surfaced inside settings or as a hidden Easter egg ("see my data"). The introspective audience doesn't open this daily; the AI does.
- **Trajectory chart on profile** — already removed.
- **Sentiment trend chart** — already removed.
- **Pattern insight cards** — already removed (subsumed by prompts).
- **Per-entry closeness impact badges** — to be removed.
- **Closeness score display on profile** — to be removed.

---

## Onboarding rewrite

Four screens. Each one earns the next.

**Screen 1 — The pitch.**

> folks
>
> *a journal that figures out the people in your life.*

**Screen 2 — The mechanic.**

> *write about anyone.*
>
> *folks reads what you've written about them and tells you what's really going on.*
>
> *(animated demo: entry text appearing → "folks says..." block appearing underneath)*

**Screen 3 — The privacy.**

> yours, only.
>
> *no account. no cloud. no backups.*
>
> *the ai reads each entry in flight — anthropic doesn't keep it, doesn't train on it. only your device does.*
>
> *(passcode pad)*

**Screen 4 — The first move.**

> *okay.*
>
> *tell us about your day.*
>
> *(drops to compose with first-entry hint above textarea)*

This onboarding can be read out loud. It's internally consistent. The audience knows by screen 2 exactly what they're getting.

---

## Privacy framing — non-negotiable

The honest version. Memorize this. Repeat it everywhere.

- **Storage:** 100% local. Entries live in IndexedDB on the user's device. No cloud sync, no account, no backups under our control.
- **Inference:** Text is sent to Anthropic's API when the AI reads. Anthropic API defaults: no training on inputs, no retention past the request, no human review on the normal path. The text comes back to the device as a response and gets stored locally.
- **Voice:** Transcribed in-browser via Web Speech API. Audio never leaves the device.

Marketing line: *"we don't keep your entries. anthropic doesn't either. only your device does."*

Don't promise "stays on this device" without qualification — it's misleading if you take it literally. The text leaves momentarily to be analyzed. The phrasing has to acknowledge that or the audience (sophisticated, privacy-aware) will lose trust the first time they read the privacy policy.

---

## Retention strategy

The retention loop is built into the mechanic, not bolted on with engagement bait.

- **Every entry has a payoff in 3 seconds.** You write about someone → folks tells you something useful about that specific relationship. You don't wait 2 weeks for the AI to get smart. The AI is useful entry 1.
- **The payoff compounds.** Entry 1 about Maya gets a basic read. Entry 10 about Maya gets a read informed by everything you've written about her. The product literally gets sharper as you use it.
- **No streaks. No push notifications by default.** The audience explicitly rejects engagement mechanics. The retention comes from the product *being useful*, not from guilt or FOMO.

Optional v2 retention layer: **weekly digest notification.** One push per week, Sunday morning, "your folks read this week" recap. Opt-in. Genre-appropriate. Co-Star sets the precedent.

If retention numbers are still soft after these, that's a positioning conversation, not a feature gap. Don't paper over weak retention with dark patterns.

---

## Guardrails

Giving relationship advice is touchy territory. The AI has to be useful without being reckless.

**Framing rules for the "folks says..." response:**

- Observation + possible move, never prescription. "this is what I see → you could try X." Never "you should leave him."
- First-person, lowercase, observational tone. Same voice as the existing Reading.
- Stay grounded in the corpus. If the AI hasn't read enough entries to say something specific, it says so honestly ("not enough yet — write a few more entries about her").
- Never speculate about the other person's interior state beyond what the text says. "based on what you wrote, she stayed late" is fine. "she's secretly in love with you" is not.

**Severity guardrail:**

The existing severity field on entries (0-3 scale) already flags abuse / violence / safety issues. For severity-3 entries:

- The AI does NOT give relationship advice.
- The response surfaces resources: "what you wrote concerns me. you might want to talk to someone — [hotline link]."
- This needs to be hardcoded server-side in the API route, not left to model behavior alone.

**Disclaimer at onboarding:**

Quietly, in the privacy step or a tooltip: *"folks is a journal, not a therapist. take what feels useful, leave what doesn't."*

---

## What folks is NOT

These have been explicitly rejected in conversation:

- **Not a chatbot.** "Ask folks about Maya" is bounded by the corpus about Maya. You can't ask folks for general advice on a topic. You can't have a conversation. Every response is grounded in your entries.
- **Not a therapist.** No therapy-speak. No "I hear you." No reflective listening jargon. The voice is observational, like a smart friend who's read your diary.
- **Not a streak app.** No gamification. No "you haven't journaled in 3 days" guilt. No XP. No badges.
- **Not a CRM.** No reminders to text people. No contact management. No event scheduling.
- **Not a social network.** No sharing entries. No friend-of-friend graphs. No public profiles. No exports of other people's names.
- **Not a generic AI app.** The product is the *bounded, personal, in-context* reading. Anyone can wrap Claude. Nobody else has your private corpus.

---

## Open questions

These were raised in conversation but not fully resolved. Each new Claude session should treat these as live decisions, not settled.

1. **Daily app or weekly app?** Current direction (advice on every entry) implies daily. But the audience tolerates weekly better. The mechanic works either way. Worth pressure-testing once the prototype is live.
2. **"Ask folks about X" — open input or guided prompts?** An open input is more powerful but more failure-prone (off-domain questions, hallucinated answers). Guided prompts (the existing detected-patterns-as-questions system) are safer but feel more constrained.
3. **Where does /ratings live?** Demoting it is settled. But hidden entirely, accessible via long-press on a person, surfaced only in settings — open.
4. **What does the AI cost per user per month at scale?** Every save now triggers a Claude call. At Sonnet pricing this is probably $0.50-2.00/user/month if they journal nightly. Need a back-of-envelope before we discuss freemium gating.
5. **Severity-3 handling.** The guardrail is described but not built. Concrete API-route logic + UI surface needed before launch.

---

## Concrete next tasks (in priority order)

1. **Ship the "folks says..." block in the detection card.** Single most important change. New /api/folks-says endpoint that takes the just-saved entry + the person's prior corpus + returns a grounded ~3-sentence response. Sonnet 4.6 is fine; Opus for richer responses if the user has 10+ entries on that person.
2. **Rewrite onboarding (4 screens).** New copy above. Drop the demo animation on screen 2 to show entry → folks-says (the existing onboarding-demo.tsx already shows entry → observation, just needs copy/structure update).
3. **Demote the ranking chrome.** Remove rank chip on profile, remove per-entry impact badges, demote /ratings from top-bar to settings or a profile gesture. Closeness math continues to run in the background.
4. **Add "ask folks about [name]" to profile.** Small input box below the Reading. Bounded, narrow, grounded in entries. Existing /api/reading prompt is a starting point.
5. **Build severity-3 guardrail.** Hardcoded server-side check before any "folks says..." response. If severity >= 3, return safety response template, not LLM call.
6. **Update CLAUDE.md** to reflect new positioning. Current CLAUDE.md still says "the ranking is the product" — that's wrong now. Replace with this doc's positioning.
7. **Honest privacy copy update.** Settings page about-section. Onboarding screen 3. Marketing site if/when one exists.

---

## What this doc isn't

- A spec. The mechanic is decided; the implementation details are open.
- A roadmap with dates. Solo dev, 5h/day, ship velocity-driven.
- Final. The retention strategy and the daily-vs-weekly question are alive. New evidence (real users, prototype data) can revise the pivot.

---

*Last updated: 2026-05-14. Owner: Arthur (arthurwangtennis@gmail.com).*
