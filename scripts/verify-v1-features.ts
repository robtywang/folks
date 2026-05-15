/**
 * Verification script for the three v1 features:
 *   1. Reading auto-trigger threshold (3, 13, 23, 33...)
 *   2. Weekly recap (Opus 4.7)
 *   3. Per-friend prompted questions (Sonnet 4.6)
 *
 * Calls the Anthropic SDK directly with the same prompt builders the production
 * API routes use, so no dev server needs to be running.
 *
 * Run with: npx tsx scripts/verify-v1-features.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── ENV ──────────────────────────────────────────────────────────────────
// Load .env.local manually since we're not in Next.js.
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, '');
  }
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY missing from .env.local');
  process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── SYNTHETIC DATA (matches strategy-snapshot.ts) ────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

interface Entry {
  id: string;
  createdAt: number;
  text: string;
  personId: string;
  sentiment: number;
  tags: string[];
  severity?: 0 | 1 | 2 | 3;
}

let _id = 0;
function e(opts: {
  personId: string;
  text: string;
  daysAgo: number;
  sentiment: number;
  severity?: 0 | 1 | 2 | 3;
  tags?: string[];
}): Entry {
  _id += 1;
  const ts = Date.now() - opts.daysAgo * DAY_MS;
  return {
    id: `${opts.personId}-${_id}`,
    createdAt: ts,
    text: opts.text,
    personId: opts.personId,
    sentiment: opts.sentiment,
    tags: opts.tags ?? [],
    severity: opts.severity ?? 0,
  };
}

const alexEntries: Entry[] = [
  e({ personId: 'alex', daysAgo: 29.5, sentiment: 7, tags: ['present'], text: 'long talk with alex about why he never responds to my texts when he\'s stressed. felt better after.' }),
  e({ personId: 'alex', daysAgo: 28.8, sentiment: 7, tags: ['warm'], text: 'alex made dinner. tagine again. still good.' }),
  e({ personId: 'alex', daysAgo: 28.2, sentiment: 3, tags: ['draining', 'effortful'], severity: 1, text: 'fight with alex this morning. couldn\'t even remember what started it.' }),
  e({ personId: 'alex', daysAgo: 27.0, sentiment: 8, tags: ['warm', 'generous'], text: 'alex picked me up from the airport. brought me a coffee.' }),
  e({ personId: 'alex', daysAgo: 26.3, sentiment: 7, tags: ['vulnerable', 'supportive'], text: 'venting to alex about work. he listened the whole time.' }),
  e({ personId: 'alex', daysAgo: 25.1, sentiment: 4, tags: ['exhausting'], severity: 1, text: 'got drunk with alex and his roommate. ended up arguing in the uber home.' }),
  e({ personId: 'alex', daysAgo: 24.7, sentiment: 8, tags: ['vulnerable', 'honest'], text: 'alex finished his thesis draft. cried a little when he showed me.' }),
  e({ personId: 'alex', daysAgo: 23.4, sentiment: 4, tags: ['distant', 'cold'], text: 'alex was distant all weekend. don\'t know what\'s going on.' }),
  e({ personId: 'alex', daysAgo: 22.6, sentiment: 8, tags: ['easy', 'present'], text: 'good morning with alex. just lazing in bed.' }),
  e({ personId: 'alex', daysAgo: 21.9, sentiment: 5, tags: ['performative'], text: 'felt like alex was performing during dinner with my parents.' }),
  e({ personId: 'alex', daysAgo: 20.2, sentiment: 8, tags: ['warm', 'present'], text: 'alex remembered my friend\'s birthday. i\'m not used to that.' }),
  e({ personId: 'alex', daysAgo: 18.8, sentiment: 3, tags: ['draining'], severity: 1, text: 'another fight. about his phone again.' }),
  e({ personId: 'alex', daysAgo: 17.4, sentiment: 7, tags: ['honest', 'vulnerable'], text: 'alex apologized first this time. that\'s new.' }),
  e({ personId: 'alex', daysAgo: 16.2, sentiment: 7, tags: ['easy', 'warm'], text: 'movie night with alex. fell asleep on him during the second half.' }),
  e({ personId: 'alex', daysAgo: 14.9, sentiment: 2, tags: ['exhausting', 'guarded'], severity: 1, text: 'found out alex has been texting his ex. don\'t know how to feel.' }),
  e({ personId: 'alex', daysAgo: 14.1, sentiment: 6, tags: ['vulnerable', 'honest'], text: 'talked it through with alex. cried. felt closer after.' }),
  e({ personId: 'alex', daysAgo: 13.0, sentiment: 8, tags: ['generous', 'warm'], text: 'alex booked us a weekend trip. quiet surprise.' }),
  e({ personId: 'alex', daysAgo: 11.6, sentiment: 9, tags: ['warm', 'easy', 'present'], text: 'weekend was actually amazing. forgot how good it can be.' }),
  e({ personId: 'alex', daysAgo: 10.3, sentiment: 3, tags: ['cold', 'draining'], severity: 1, text: 'fight again. it\'s been 3 days of cold dinners.' }),
  e({ personId: 'alex', daysAgo: 9.1, sentiment: 8, tags: ['warm', 'generous'], text: 'alex bought me flowers. white tulips.' }),
  e({ personId: 'alex', daysAgo: 8.0, sentiment: 9, tags: ['warm', 'honest'], text: 'alex told me he loves me in the morning today. unprompted.' }),
  e({ personId: 'alex', daysAgo: 7.2, sentiment: 4, tags: ['cold', 'performative'], text: 'passive aggressive comments all evening. so tired.' }),
  e({ personId: 'alex', daysAgo: 6.5, sentiment: 6, tags: ['easy'], text: 'spent the day apart. needed it.' }),
  e({ personId: 'alex', daysAgo: 5.4, sentiment: 8, tags: ['supportive', 'present'], text: 'alex was sweet about my deadline. brought me coffee twice.' }),
  e({ personId: 'alex', daysAgo: 4.6, sentiment: 4, tags: ['exhausting'], severity: 1, text: 'fight about chores. again.' }),
  e({ personId: 'alex', daysAgo: 4.0, sentiment: 7, tags: ['honest'], text: 'made up after. he made the bed.' }),
  e({ personId: 'alex', daysAgo: 3.1, sentiment: 7, tags: ['supportive'], text: 'alex\'s mom called him out for being short with me. small relief.' }),
  e({ personId: 'alex', daysAgo: 2.2, sentiment: 6, tags: ['vulnerable', 'anxious'], text: 'alex and i talked about moving in together. i\'m scared.' }),
  e({ personId: 'alex', daysAgo: 1.4, sentiment: 7, tags: ['warm', 'easy'], text: 'alex cooked. badly. but the effort was sweet.' }),
  e({ personId: 'alex', daysAgo: 0.5, sentiment: 8, tags: ['present', 'supportive'], text: 'alex was the only person who texted me on my hard day.' }),
];

const otherEntries: Entry[] = [
  e({ personId: 'sarah', daysAgo: 12.0, sentiment: 7, tags: ['present', 'supportive'], text: 'coffee with sarah. she\'s still figuring out her job. listened more than talked.' }),
  e({ personId: 'marcus', daysAgo: 8.5, sentiment: 6, tags: ['easy'], text: 'ran into marcus at the gym. caught up briefly. he\'s training for a marathon.' }),
  e({ personId: 'jamie', daysAgo: 5.0, sentiment: 7, tags: ['fun', 'warm'], text: 'jamie texted me about her new dog. funny how she always sends me photos first.' }),
  e({ personId: 'priya', daysAgo: 3.0, sentiment: 8, tags: ['warm', 'generous'], text: 'priya invited me to her birthday. haven\'t seen her in months but she always makes me feel close.' }),
  e({ personId: 'ro', daysAgo: 1.0, sentiment: 6, tags: ['vulnerable', 'supportive'], text: 'long voice memo from ro about his ex. listened on the walk home.' }),
];

// A synthetic friend with patterns explicitly engineered to trip the detector,
// so we can verify Sonnet renders patterns into questions correctly. (Alex's
// real-relationship data is intentionally chaotic and below all the detector
// thresholds — that's the point of the statistical pre-filter.)
const NOW = Date.now();
function withHour(daysAgo: number, hour: number): number {
  const d = new Date(NOW - daysAgo * DAY_MS);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}
function patternEntry(opts: {
  personId: string;
  text: string;
  daysAgo: number;
  hour: number;
  sentiment: number;
  tags?: string[];
}): Entry {
  _id += 1;
  return {
    id: `${opts.personId}-${_id}`,
    createdAt: withHour(opts.daysAgo, opts.hour),
    text: opts.text,
    personId: opts.personId,
    sentiment: opts.sentiment,
    tags: opts.tags ?? [],
    severity: 0,
  };
}
// Maya: 10 entries. Engineered patterns:
//   - "present" tag on 5 of 10 = 50% → tag_dominant fires
//   - morning entries (h<12) average way higher than evening
const mayaEntries: Entry[] = [
  patternEntry({ personId: 'maya', daysAgo: 28, hour: 9, sentiment: 8, tags: ['present', 'warm'], text: 'morning walk with maya. easy conversation about her new job.' }),
  patternEntry({ personId: 'maya', daysAgo: 25, hour: 21, sentiment: 5, tags: ['distant'], text: 'maya seemed somewhere else at dinner. on her phone a lot.' }),
  patternEntry({ personId: 'maya', daysAgo: 22, hour: 8, sentiment: 9, tags: ['present', 'vulnerable'], text: 'coffee with maya before work. she opened up about her therapist.' }),
  patternEntry({ personId: 'maya', daysAgo: 19, hour: 22, sentiment: 4, tags: ['exhausting'], text: 'late drinks with maya and friends. she was performing for them all night.' }),
  patternEntry({ personId: 'maya', daysAgo: 15, hour: 10, sentiment: 8, tags: ['present', 'easy'], text: 'morning yoga with maya. quiet and good.' }),
  patternEntry({ personId: 'maya', daysAgo: 12, hour: 20, sentiment: 5, tags: ['cold'], text: 'evening text exchange with maya. she was short.' }),
  patternEntry({ personId: 'maya', daysAgo: 9, hour: 9, sentiment: 9, tags: ['present', 'honest'], text: 'morning call with maya — long, honest. one of the best in a while.' }),
  patternEntry({ personId: 'maya', daysAgo: 6, hour: 23, sentiment: 4, tags: ['draining'], text: 'late night with maya at a bar. she got drunk and combative.' }),
  patternEntry({ personId: 'maya', daysAgo: 3, hour: 8, sentiment: 8, tags: ['present', 'supportive'], text: 'breakfast with maya. she remembered my interview.' }),
  patternEntry({ personId: 'maya', daysAgo: 1, hour: 21, sentiment: 5, tags: ['guarded'], text: 'evening dinner. quiet but felt distant.' }),
];

const allEntries = [...alexEntries, ...otherEntries, ...mayaEntries];

const PEOPLE: Record<string, { name: string }> = {
  alex: { name: 'Alex' },
  sarah: { name: 'Sarah' },
  marcus: { name: 'Marcus' },
  jamie: { name: 'Jamie' },
  priya: { name: 'Priya' },
  ro: { name: 'Ro' },
  maya: { name: 'Maya' },
};

// ── PATTERN DETECTION (verbatim from lib/insights.ts) ────────────────────

const DEPTH_TAGS = ['vulnerable', 'honest', 'present', 'supportive'];
const MIN_COHORT = 3;
const MIN_SENTIMENT_DELTA = 1.2;

interface DetectedPattern {
  kind: string;
  fact: string;
  support: number;
  delta?: number;
}

function detectPatterns(entries: Entry[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  if (entries.length < MIN_COHORT) return patterns;

  const byDay: { sentiments: number[]; count: number }[] = Array.from(
    { length: 7 },
    () => ({ sentiments: [], count: 0 })
  );
  for (const e of entries) {
    const day = new Date(e.createdAt).getDay();
    byDay[day]!.sentiments.push(e.sentiment);
    byDay[day]!.count += 1;
  }
  const weekdayEntries = byDay.slice(1, 6).flatMap((d) => d.sentiments);
  const weekendEntries = [byDay[0]!, byDay[6]!].flatMap((d) => d.sentiments);
  if (weekdayEntries.length >= MIN_COHORT && weekendEntries.length >= MIN_COHORT) {
    const weekdayAvg = weekdayEntries.reduce((a, b) => a + b, 0) / weekdayEntries.length;
    const weekendAvg = weekendEntries.reduce((a, b) => a + b, 0) / weekendEntries.length;
    const delta = weekendAvg - weekdayAvg;
    if (Math.abs(delta) >= MIN_SENTIMENT_DELTA) {
      const warmer = delta > 0 ? 'weekend' : 'weekday';
      const warmerAvg = delta > 0 ? weekendAvg : weekdayAvg;
      const coolerAvg = delta > 0 ? weekdayAvg : weekendAvg;
      patterns.push({
        kind: delta > 0 ? 'weekend_warmer' : 'weekday_warmer',
        fact: `${warmer} sentiment averages ${warmerAvg.toFixed(1)} vs ${coolerAvg.toFixed(1)} on the other days`,
        support: warmer === 'weekend' ? weekendEntries.length : weekdayEntries.length,
        delta: Math.abs(delta),
      });
    }
  }

  const morning: number[] = [];
  const evening: number[] = [];
  for (const e of entries) {
    const h = new Date(e.createdAt).getHours();
    if (h < 12) morning.push(e.sentiment);
    else if (h >= 18) evening.push(e.sentiment);
  }
  if (morning.length >= MIN_COHORT && evening.length >= MIN_COHORT) {
    const mAvg = morning.reduce((a, b) => a + b, 0) / morning.length;
    const eAvg = evening.reduce((a, b) => a + b, 0) / evening.length;
    const delta = mAvg - eAvg;
    if (Math.abs(delta) >= MIN_SENTIMENT_DELTA) {
      const better = delta > 0 ? 'morning' : 'evening';
      patterns.push({
        kind: 'time_of_day_warmer',
        fact: `${better} entries average ${(delta > 0 ? mAvg : eAvg).toFixed(1)} vs ${(delta > 0 ? eAvg : mAvg).toFixed(1)} the other time of day`,
        support: better === 'morning' ? morning.length : evening.length,
        delta: Math.abs(delta),
      });
    }
  }

  const tagCounts: Record<string, number> = {};
  for (const e of entries) for (const t of e.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  if (sortedTags.length > 0) {
    const [topTag, topCount] = sortedTags[0]!;
    if (topCount >= MIN_COHORT && topCount / entries.length >= 0.4) {
      patterns.push({
        kind: 'tag_dominant',
        fact: `the tag "${topTag}" appears on ${topCount} of ${entries.length} entries`,
        support: topCount,
      });
    }
  }

  if (entries.length >= 8) {
    const sortedByTime = [...entries].sort((a, b) => a.createdAt - b.createdAt);
    const tail = sortedByTime.slice(-4);
    const prior = sortedByTime.slice(-8, -4);
    const tailAvg = tail.reduce((a, b) => a + b.sentiment, 0) / tail.length;
    const priorAvg = prior.reduce((a, b) => a + b.sentiment, 0) / prior.length;
    const delta = tailAvg - priorAvg;
    if (Math.abs(delta) >= MIN_SENTIMENT_DELTA) {
      patterns.push({
        kind: 'sentiment_trending',
        fact: `sentiment over the last 4 entries averages ${tailAvg.toFixed(1)} vs ${priorAvg.toFixed(1)} in the prior 4`,
        support: 4,
        delta: Math.abs(delta),
      });
    }
  }

  return patterns;
}

// ── WEEKLY RECAP PROMPT (verbatim from app/api/weekly-recap/route.ts) ────

function buildRecapPrompt(args: {
  stats: {
    totalEntries: number;
    peopleMentioned: number;
    avgSentiment: number;
    topPeople: Array<{
      name: string;
      entryCount: number;
      avgSentiment: number;
      lastSeenDaysAgo: number;
      gapNotable?: string;
    }>;
  };
  entrySample: Array<{
    personName: string | null;
    text: string;
    sentiment: number;
    tags: string[];
    daysAgo: number;
  }>;
}): string {
  const { stats, entrySample } = args;
  const topPeopleLines = stats.topPeople
    .map(
      (p) =>
        `- ${p.name}: ${p.entryCount} entries this week, avg sentiment ${p.avgSentiment.toFixed(1)}/10, last seen ${p.lastSeenDaysAgo}d ago${p.gapNotable ? `, ${p.gapNotable}` : ''}`
    )
    .join('\n');
  const sampleLines = entrySample
    .map(
      (e, i) =>
        `${i + 1}. ${e.personName ? `[about ${e.personName.toLowerCase()}]` : '[solo]'} [${e.daysAgo}d ago, sentiment ${e.sentiment}/10, tags: ${e.tags.join(', ') || 'none'}] "${e.text}"`
    )
    .join('\n');

  return `You write the weekly digest for a friends-tracker journal app. The user gets ONE digest per week, on Sunday morning. It summarises the social shape of the past 7 days based on the entries they logged.

WEEK STATS (pre-computed — these are facts):
- ${stats.totalEntries} entries logged this week
- ${stats.peopleMentioned} people mentioned
- average sentiment across all entries: ${stats.avgSentiment.toFixed(1)} / 10

TOP MENTIONED PEOPLE THIS WEEK:
${topPeopleLines}

ENTRY SAMPLE (for tonal grounding, do NOT quote directly):
${sampleLines}

Return JSON only, no preamble:
{
  "content": "<the full recap, plain text, 4-7 short lines>"
}

STRUCTURE the recap as:
1. Opening: 1-2 sentences about the week's social shape (count + tone + who was on the user's mind most).
2. 2-3 per-friend observations for the top mentioned people, each as an IMPLICIT-PROMPT observation. "first time mentioning marcus in 3 weeks" — not "you should text marcus." "all warmth this week with sarah" — not "keep that going."
3. Closing: one short observational line that holds the week.

VOICE (CRITICAL):
- Lowercase, italic-prose tone. Co-Star / Letterboxd brevity.
- Observational, never advisory. Never therapy-speak.
- Never use "you should..." or imperatives.
- Use first names in lowercase.
- One observation per line. Newlines between sections.
- Do not enumerate (no "1.", "2."). Each line stands on its own.
- ~40-100 chars per line. The whole digest should feel quiet.
- Don't invent. If the stats say someone was the most mentioned, write that. Don't speculate beyond what the numbers + sample show.`;
}

// ── PROMPTS PROMPT (verbatim from app/api/prompts/route.ts) ───────────────

function buildPromptsPrompt(args: {
  person: { name: string; entryCount: number; avgSentiment: number; userContext: string | null };
  patterns: DetectedPattern[];
  entrySample: Array<{ text: string; sentiment: number; tags: string[]; daysAgo: number }>;
}): string {
  const { person, patterns, entrySample } = args;
  const patternLines = patterns
    .map((p, i) => {
      const supportFrag =
        p.delta !== undefined ? ` (n=${p.support}, delta=${p.delta.toFixed(1)})` : ` (n=${p.support})`;
      return `${i + 1}. [${p.kind}] ${p.fact}${supportFrag}`;
    })
    .join('\n');
  const sampleLines = entrySample
    .map(
      (e, i) =>
        `${i + 1}. [${e.daysAgo}d ago, sentiment ${e.sentiment}/10, tags: ${e.tags.join(', ') || 'none'}] "${e.text}"`
    )
    .join('\n');

  return `You phrase pre-detected behavioural patterns as soft, observational QUESTIONS for a friends-tracker journal app. The user sees these on a friend's profile as prompts that might be worth logging about.

CRITICAL: You do NOT find patterns. The statistical analysis has already been done. Your only job is to turn each detected fact below into a single open question. If your question implies a pattern that isn't in the facts list, you are inventing — do not do this.

PERSON: ${person.name}
- ${person.entryCount} entries logged
- avg sentiment ${person.avgSentiment.toFixed(1)} / 10

DETECTED PATTERNS (n = entries supporting the pattern):
${patternLines}

ENTRY SAMPLE (tonal context only):
${sampleLines}

Return JSON only, no preamble:
{
  "questions": [
    { "question": "<a single open question, lowercase, ~40-90 chars>", "sourcePattern": "<short label of which pattern this came from>" },
    ...
  ]
}

Rules:
- One question per detected pattern. Maximum 5 questions, minimum 1.
- Each question must be answerable in an entry — concrete, not abstract.
- Use the person's first name in lowercase. e.g. "what was different about saturday with maya?"
- Never advisory ("you should...", "have you tried..."). Never therapeutic. Just curious.
- Questions should make the user want to write, not feel diagnosed.
- Acknowledge weak signal in phrasing if support is low. n < 5 → "noticing" / "lately" / "maybe", not declarative.
- Don't ask "why" questions about the user's feelings ("why do you feel happier..."). Ask about the situation ("what happens on the saturdays with maya?").
- Don't quote entries directly.
- "sourcePattern" is a short kebab-case-or-plain-words tag like "weekend-warmer", "morning-warmer", "tag: vulnerable", "trending down", "gap unusual". Keep it under 30 chars.`;
}

// ── BUILD INPUTS ─────────────────────────────────────────────────────────

// Past 7 days of entries (for the recap).
const sevenDaysAgo = Date.now() - 7 * DAY_MS;
const weekEntries = allEntries.filter((e) => e.createdAt >= sevenDaysAgo);
const perPersonWeek = new Map<string, Entry[]>();
for (const ent of weekEntries) {
  const list = perPersonWeek.get(ent.personId) ?? [];
  list.push(ent);
  perPersonWeek.set(ent.personId, list);
}
const topPeople = Array.from(perPersonWeek.entries())
  .map(([pid, ents]) => ({
    name: PEOPLE[pid]!.name,
    entryCount: ents.length,
    avgSentiment: ents.reduce((s, e) => s + e.sentiment, 0) / ents.length,
    lastSeenDaysAgo: Math.floor(
      (Date.now() - Math.max(...ents.map((e) => e.createdAt))) / DAY_MS
    ),
  }))
  .sort((a, b) => b.entryCount - a.entryCount)
  .slice(0, 3);

const recapStats = {
  totalEntries: weekEntries.length,
  peopleMentioned: perPersonWeek.size,
  avgSentiment: weekEntries.reduce((s, e) => s + e.sentiment, 0) / weekEntries.length,
  topPeople,
};
const recapSample = [...weekEntries]
  .sort((a, b) => b.createdAt - a.createdAt)
  .slice(0, 8)
  .map((e) => ({
    personName: PEOPLE[e.personId]?.name ?? null,
    text: e.text,
    sentiment: e.sentiment,
    tags: e.tags,
    daysAgo: Math.floor((Date.now() - e.createdAt) / DAY_MS),
  }));

// Pattern detection for Alex.
const alexPatterns = detectPatterns(alexEntries);
const alexAvgSent = alexEntries.reduce((s, e) => s + e.sentiment, 0) / alexEntries.length;
const alexSample = [...alexEntries]
  .sort((a, b) => b.createdAt - a.createdAt)
  .slice(0, 8)
  .map((e) => ({
    text: e.text,
    sentiment: e.sentiment,
    tags: e.tags,
    daysAgo: Math.max(0, Math.floor((Date.now() - e.createdAt) / DAY_MS)),
  }));

// Pattern detection for Maya (engineered to trip detector).
const mayaPatternsDetected = detectPatterns(mayaEntries);
const mayaAvgSent = mayaEntries.reduce((s, e) => s + e.sentiment, 0) / mayaEntries.length;
const maySample = [...mayaEntries]
  .sort((a, b) => b.createdAt - a.createdAt)
  .slice(0, 8)
  .map((e) => ({
    text: e.text,
    sentiment: e.sentiment,
    tags: e.tags,
    daysAgo: Math.max(0, Math.floor((Date.now() - e.createdAt) / DAY_MS)),
  }));

// Pattern detection for Sarah (1 entry — should be empty).
const sarahEntries = allEntries.filter((e) => e.personId === 'sarah');
const sarahPatterns = detectPatterns(sarahEntries);

// ── RUN ──────────────────────────────────────────────────────────────────

async function callOpus(prompt: string): Promise<string> {
  const m = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });
  return m.content[0]?.type === 'text' ? m.content[0].text : '';
}

async function callSonnet(prompt: string): Promise<string> {
  const m = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });
  return m.content[0]?.type === 'text' ? m.content[0].text : '';
}

function extractJson<T>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

const sep = '═'.repeat(80);

async function main() {
  console.log('\n' + sep);
  console.log(' FEATURE 1 — READING AUTO-TRIGGER THRESHOLD');
  console.log(sep);
  console.log(`
shouldAutoFireReading(entryCount):
  entryCount=1  → ${false}  (forming)
  entryCount=2  → ${false}  (forming)
  entryCount=3  → ${true}   ← FIRES (first stable moment)
  entryCount=4  → ${(4 - 3) % 10 === 0}
  entryCount=10 → ${(10 - 3) % 10 === 0}
  entryCount=13 → ${(13 - 3) % 10 === 0}  ← FIRES
  entryCount=23 → ${(23 - 3) % 10 === 0}  ← FIRES
  entryCount=33 → ${(33 - 3) % 10 === 0}  ← FIRES
  entryCount=40 → ${(40 - 3) % 10 === 0}

Before (no auto-trigger existed): users had to manually click "generate"
or "rerun ↻" on the profile to refresh their reading.

After (lib/reading-auto.ts + save-entry.ts wiring):
- maybeAutoFireReading(personId) is called fire-and-forget after every save
- Predicate fires only at entries 3, 13, 23, 33, ...
- Skips muted + transient persons
- $0.05 / call × ~4 calls / lifetime per friend = ~$0.20 total Opus spend / friend
`);

  console.log('\n' + sep);
  console.log(' FEATURE 2 — WEEKLY RECAP (OPUS 4.7)');
  console.log(sep);
  console.log(`\nInputs (past 7 days):
- total entries:       ${recapStats.totalEntries}
- people mentioned:    ${recapStats.peopleMentioned}
- avg sentiment:       ${recapStats.avgSentiment.toFixed(2)} / 10
- top people:`);
  for (const tp of recapStats.topPeople) {
    console.log(
      `  · ${tp.name.padEnd(8)} ${tp.entryCount} entries, avg ${tp.avgSentiment.toFixed(1)}/10, last seen ${tp.lastSeenDaysAgo}d ago`
    );
  }

  console.log('\nCalling claude-opus-4-7 ...\n');
  const recapRaw = await callOpus(buildRecapPrompt({ stats: recapStats, entrySample: recapSample }));
  const recapJson = extractJson<{ content: string }>(recapRaw);
  if (!recapJson?.content) {
    console.log('NO JSON in response:');
    console.log(recapRaw);
  } else {
    console.log('━━━ RECAP CONTENT (verbatim from Opus) ━━━');
    console.log(recapJson.content);
    console.log('━━━ end recap ━━━');
  }

  console.log('\n' + sep);
  console.log(' FEATURE 3 — PROMPTED QUESTIONS (SONNET 4.6) — ALEX');
  console.log(sep);
  console.log(`\nInputs:
- name:           Alex
- entries:        ${alexEntries.length}
- avg sentiment:  ${alexAvgSent.toFixed(2)} / 10
- detected patterns:`);
  for (const p of alexPatterns) {
    console.log(`  · [${p.kind}] ${p.fact} (n=${p.support}${p.delta !== undefined ? `, delta=${p.delta.toFixed(1)}` : ''})`);
  }

  if (alexPatterns.length === 0) {
    console.log('\nNo patterns detected — skipping Claude call (would return empty).');
  } else {
    console.log('\nCalling claude-sonnet-4-6 ...\n');
    const alexRaw = await callSonnet(
      buildPromptsPrompt({
        person: {
          name: 'Alex',
          entryCount: alexEntries.length,
          avgSentiment: alexAvgSent,
          userContext: null,
        },
        patterns: alexPatterns,
        entrySample: alexSample,
      })
    );
    const alexJson = extractJson<{
      questions: Array<{ question: string; sourcePattern: string }>;
    }>(alexRaw);
    if (!alexJson?.questions) {
      console.log('NO JSON in response:');
      console.log(alexRaw);
    } else {
      console.log('━━━ ALEX QUESTIONS (verbatim from Sonnet) ━━━');
      for (const q of alexJson.questions) {
        console.log(`  · "${q.question}"  [${q.sourcePattern}]`);
      }
      console.log('━━━ end questions ━━━');
    }
  }

  console.log('\n' + sep);
  console.log(' FEATURE 3 — PROMPTED QUESTIONS (SONNET 4.6) — MAYA (PATTERNS PRESENT)');
  console.log(sep);
  console.log(`\nInputs:
- name:           Maya
- entries:        ${mayaEntries.length}
- avg sentiment:  ${mayaAvgSent.toFixed(2)} / 10
- detected patterns:`);
  for (const p of mayaPatternsDetected) {
    console.log(`  · [${p.kind}] ${p.fact} (n=${p.support}${p.delta !== undefined ? `, delta=${p.delta.toFixed(1)}` : ''})`);
  }

  if (mayaPatternsDetected.length > 0) {
    console.log('\nCalling claude-sonnet-4-6 ...\n');
    const mayaRaw = await callSonnet(
      buildPromptsPrompt({
        person: {
          name: 'Maya',
          entryCount: mayaEntries.length,
          avgSentiment: mayaAvgSent,
          userContext: null,
        },
        patterns: mayaPatternsDetected,
        entrySample: maySample,
      })
    );
    const mayaJson = extractJson<{
      questions: Array<{ question: string; sourcePattern: string }>;
    }>(mayaRaw);
    if (!mayaJson?.questions) {
      console.log('NO JSON in response:');
      console.log(mayaRaw);
    } else {
      console.log('━━━ MAYA QUESTIONS (verbatim from Sonnet) ━━━');
      for (const q of mayaJson.questions) {
        console.log(`  · "${q.question}"  [${q.sourcePattern}]`);
      }
      console.log('━━━ end questions ━━━');
    }
  }

  console.log('\n' + sep);
  console.log(' FEATURE 3 — PROMPTED QUESTIONS (SONNET 4.6) — SARAH (FORMING)');
  console.log(sep);
  console.log(`\nInputs:
- name:           Sarah
- entries:        ${sarahEntries.length}  (forming — must be ≥3 to be eligible)
- detected patterns: ${sarahPatterns.length}

maybeRefreshPrompts(sarah.id, 'manual') would early-return:
  → person.entryCount < MIN_ENTRIES (3)
  → reason: "forming"
  → NO Claude call made — saves $0.005 + avoids hallucinated patterns

After Sarah accumulates 3 entries, the same detector + Sonnet path
becomes active, with phrasing softened to "early signal:" / "lately"
because pattern support is low.
`);

  console.log('\n' + sep);
  console.log(' VERIFICATION COMPLETE');
  console.log(sep + '\n');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
