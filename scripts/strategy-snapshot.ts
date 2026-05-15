/**
 * Strategy snapshot — 35 synthetic voice-journal entries, run through the
 * production closeness algorithm. Outputs the ranked list, per-person
 * breakdown, and per-entry impact deltas.
 *
 * The algorithm body below is copied verbatim from lib/closeness.ts. It's
 * inlined because the production file imports Dexie at module top, which
 * crashes in pure Node. Running with `npx tsx scripts/strategy-snapshot.ts`.
 */

// ── ALGORITHM (verbatim from lib/closeness.ts) ────────────────────────────

interface Entry {
  id: string;
  createdAt: number;
  updatedAt: number;
  text: string;
  personId: string | null;
  sentiment: number;
  tags: string[];
  aiConfidence: number;
  userConfirmed: boolean;
  additionalPeople?: string[];
  severity?: 0 | 1 | 2 | 3;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_LIFE_DAYS = 60;
const RECENT_WINDOW_DAYS = 90;
const PERTURBATION_WINDOW_DAYS = 14;
const MAX_PERTURBATION = 0.5;
const FREQ_SATURATION = 50;
const SAMPLE_SIZE_THRESHOLD = 3;
const DEPTH_TAGS = ['vulnerable', 'honest', 'present', 'supportive'];
const INTENSITY_PIVOT = 5.5;
const MAX_POSITIVE_INTENSITY = 4.5;
const SEVERITY_PENALTY_SCALE = 0.4;
const SEVERITY_PENALTY_CAP = -4.0;
const SEVERE_CEILING_LOOKBACK_DAYS = 30;
const SEVERE_CEILING_LEVEL = 3;
const SEVERE_CEILING_VALUE = 3.0;

function daysAgo(timestamp: number, asOfTime: number = Date.now()): number {
  return (asOfTime - timestamp) / DAY_MS;
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

interface ClosenessResult {
  base: number;
  perturbation: number;
  severityPenalty: number;
  display: number;
}

function baseClosenessFor(entries: Entry[], asOfTime: number = Date.now()): number {
  const valid = entries.filter((e) => e.createdAt <= asOfTime);
  if (valid.length === 0) return 0;
  let weightedPositive = 0;
  let totalWeight = 0;
  for (const e of valid) {
    const decay = Math.exp(-daysAgo(e.createdAt, asOfTime) / HALF_LIFE_DAYS);
    const positiveValence = Math.max(0, e.sentiment - INTENSITY_PIVOT);
    weightedPositive += positiveValence * decay;
    totalWeight += decay;
  }
  const positiveScore = totalWeight > 0 ? weightedPositive / totalWeight : 0;
  const positiveNorm = Math.min(positiveScore / MAX_POSITIVE_INTENSITY, 1);
  const recentCount = valid.filter(
    (e) => daysAgo(e.createdAt, asOfTime) <= RECENT_WINDOW_DAYS
  ).length;
  const freqNorm = Math.log(1 + recentCount) / Math.log(FREQ_SATURATION);
  const depthEntries = valid.filter(
    (e) => e.tags && e.tags.some((t) => DEPTH_TAGS.includes(t))
  );
  const depthNorm = depthEntries.length / valid.length;
  const composite = positiveNorm * 0.3 + freqNorm * 0.55 + depthNorm * 0.15;
  return clamp(composite * 10, 0, 10);
}

function severityPenaltyFor(entries: Entry[], asOfTime: number = Date.now()): number {
  let raw = 0;
  for (const e of entries) {
    if (e.createdAt > asOfTime) continue;
    const severity = e.severity ?? 0;
    if (severity === 0) continue;
    const decay = Math.exp(-daysAgo(e.createdAt, asOfTime) / HALF_LIFE_DAYS);
    raw += severity * severity * SEVERITY_PENALTY_SCALE * decay;
  }
  return Math.max(-raw, SEVERITY_PENALTY_CAP);
}

function hasRecentSevere(entries: Entry[], asOfTime: number = Date.now()): boolean {
  const cutoff = asOfTime - SEVERE_CEILING_LOOKBACK_DAYS * DAY_MS;
  return entries.some(
    (e) =>
      e.createdAt >= cutoff &&
      e.createdAt <= asOfTime &&
      (e.severity ?? 0) >= SEVERE_CEILING_LEVEL
  );
}

function sentimentPerturbation(entries: Entry[], asOfTime: number = Date.now()): number {
  const recent = entries.filter(
    (e) =>
      e.createdAt <= asOfTime &&
      daysAgo(e.createdAt, asOfTime) <= PERTURBATION_WINDOW_DAYS
  );
  if (recent.length === 0) return 0;
  const avg = recent.reduce((a, e) => a + e.sentiment, 0) / recent.length;
  const delta = (avg - INTENSITY_PIVOT) * 0.15;
  return clamp(delta, -MAX_PERTURBATION, MAX_PERTURBATION);
}

function closenessFor(entries: Entry[], asOfTime: number = Date.now()): ClosenessResult {
  const base = baseClosenessFor(entries, asOfTime);
  const perturbation = sentimentPerturbation(entries, asOfTime);
  const severityPenalty = severityPenaltyFor(entries, asOfTime);
  let display = clamp(base + perturbation + severityPenalty, 0, 10);
  if (hasRecentSevere(entries, asOfTime)) {
    display = Math.min(display, SEVERE_CEILING_VALUE);
  }
  return { base, perturbation, severityPenalty, display };
}

function closenessState(entries: Entry[]): 'forming' | 'stable' {
  return entries.length < SAMPLE_SIZE_THRESHOLD ? 'forming' : 'stable';
}

function entryImpacts(entries: Entry[]): Map<string, number> {
  const result = new Map<string, number>();
  if (entries.length === 0) return result;
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  let prevScore = 0;
  for (let i = 0; i < sorted.length; i++) {
    const upTo = sorted.slice(0, i + 1);
    const score = closenessFor(upTo, sorted[i].createdAt).display;
    result.set(sorted[i].id, score - prevScore);
    prevScore = score;
  }
  return result;
}

// ── SYNTHETIC DATA ────────────────────────────────────────────────────────

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
    updatedAt: ts,
    text: opts.text,
    personId: opts.personId,
    sentiment: opts.sentiment,
    tags: opts.tags ?? [],
    aiConfidence: 0.9,
    userConfirmed: false,
    additionalPeople: [],
    severity: opts.severity ?? 0,
  };
}

// 30 entries about Alex — romantic partner, mix of warmth and venting.
// Realistic sentiment range (most around 4-8, some heights, some lows).
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

// 5 friends, one entry each.
const otherEntries: Entry[] = [
  e({ personId: 'sarah', daysAgo: 12.0, sentiment: 7, tags: ['present', 'supportive'], text: 'coffee with sarah. she\'s still figuring out her job. listened more than talked.' }),
  e({ personId: 'marcus', daysAgo: 8.5, sentiment: 6, tags: ['easy'], text: 'ran into marcus at the gym. caught up briefly. he\'s training for a marathon.' }),
  e({ personId: 'jamie', daysAgo: 5.0, sentiment: 7, tags: ['fun', 'warm'], text: 'jamie texted me about her new dog. funny how she always sends me photos first.' }),
  e({ personId: 'priya', daysAgo: 3.0, sentiment: 8, tags: ['warm', 'generous'], text: 'priya invited me to her birthday. haven\'t seen her in months but she always makes me feel close.' }),
  e({ personId: 'ro', daysAgo: 1.0, sentiment: 6, tags: ['vulnerable', 'supportive'], text: 'long voice memo from ro about his ex. listened on the walk home.' }),
];

const NAMES: Record<string, string> = {
  alex: 'Alex',
  sarah: 'Sarah',
  marcus: 'Marcus',
  jamie: 'Jamie',
  priya: 'Priya',
  ro: 'Ro',
};

const allEntries = [...alexEntries, ...otherEntries];

// ── RUN ───────────────────────────────────────────────────────────────────

const byPerson = new Map<string, Entry[]>();
for (const entry of allEntries) {
  if (!entry.personId) continue;
  const list = byPerson.get(entry.personId) ?? [];
  list.push(entry);
  byPerson.set(entry.personId, list);
}

interface Row {
  personId: string;
  name: string;
  count: number;
  state: 'forming' | 'stable';
  base: number;
  perturbation: number;
  severityPenalty: number;
  display: number;
  avgSentiment: number;
  positiveCount: number;
  negativeCount: number;
}

const rows: Row[] = [];
for (const [pid, entries] of byPerson.entries()) {
  const c = closenessFor(entries);
  const state = closenessState(entries);
  const sent = entries.map((e) => e.sentiment);
  const avgSent = sent.reduce((a, b) => a + b, 0) / sent.length;
  const positiveCount = entries.filter((e) => e.sentiment > 5.5).length;
  const negativeCount = entries.filter((e) => e.sentiment < 5.5).length;
  rows.push({
    personId: pid,
    name: NAMES[pid] ?? pid,
    count: entries.length,
    state,
    base: c.base,
    perturbation: c.perturbation,
    severityPenalty: c.severityPenalty,
    display: c.display,
    avgSentiment: avgSent,
    positiveCount,
    negativeCount,
  });
}

rows.sort((a, b) => b.display - a.display);

// ── OUTPUT ────────────────────────────────────────────────────────────────

const sep = '─'.repeat(96);

console.log('\n=== RANKED CLOSENESS (35 entries, today as t=0) ===\n');
console.log(
  '#  NAME      N   STATE     DISPLAY  BASE   PERT   SEV    AVG-SENT  POS/NEG'
);
console.log(sep);
rows.forEach((r, i) => {
  console.log(
    `${String(i + 1).padEnd(3)}${r.name.padEnd(10)}${String(r.count).padEnd(4)}${r.state.padEnd(10)}${r.display.toFixed(2).padStart(6)}   ${r.base.toFixed(2).padStart(5)}  ${r.perturbation >= 0 ? '+' : ''}${r.perturbation.toFixed(2).padStart(5)}  ${r.severityPenalty.toFixed(2).padStart(5)}  ${r.avgSentiment.toFixed(2).padStart(6)}    ${r.positiveCount}/${r.negativeCount}`
  );
});

// Per-entry impact for the dominant person (Alex).
console.log('\n=== PER-ENTRY IMPACTS — ALEX ===\n');
console.log('d_ago  S   SEV  IMPACT   TAGS                    TEXT');
console.log(sep);
const alexImpacts = entryImpacts(alexEntries);
const sortedAlex = [...alexEntries].sort((a, b) => a.createdAt - b.createdAt);
for (const entry of sortedAlex) {
  const impact = alexImpacts.get(entry.id) ?? 0;
  const sign = impact >= 0 ? '+' : '';
  const sev = entry.severity ?? 0;
  console.log(
    `${(((Date.now() - entry.createdAt) / DAY_MS).toFixed(1)).padStart(5)}  ${entry.sentiment}   ${sev}    ${sign}${impact.toFixed(2).padStart(5)}   ${(entry.tags.join(',')).padEnd(22)}  "${entry.text.slice(0, 60)}${entry.text.length > 60 ? '…' : ''}"`
  );
}

// Per-entry impact for each 1-entry friend.
console.log('\n=== PER-ENTRY IMPACTS — OTHER FRIENDS (1 each) ===\n');
for (const entry of otherEntries) {
  const impacts = entryImpacts([entry]);
  const impact = impacts.get(entry.id) ?? 0;
  const sign = impact >= 0 ? '+' : '';
  console.log(
    `${(NAMES[entry.personId!] ?? entry.personId!).padEnd(8)} d${((Date.now() - entry.createdAt) / DAY_MS).toFixed(1)}d s${entry.sentiment} | impact ${sign}${impact.toFixed(2)} | "${entry.text}"`
  );
}

// Interpretation summary.
console.log('\n=== INTERPRETATION ===\n');
const alex = rows.find((r) => r.personId === 'alex')!;
const friends = rows.filter((r) => r.personId !== 'alex');
const friendAvg = friends.reduce((s, r) => s + r.display, 0) / friends.length;
console.log(`Alex display:               ${alex.display.toFixed(2)}`);
console.log(`Other 5 friends (avg):      ${friendAvg.toFixed(2)}`);
console.log(`Ratio Alex / friend-avg:    ${(alex.display / friendAvg).toFixed(1)}×`);
console.log(`Friends in forming state:   ${friends.filter((r) => r.state === 'forming').length} / ${friends.length}`);
console.log(`Friends in stable state:    ${friends.filter((r) => r.state === 'stable').length} / ${friends.length}`);
console.log(
  `\nAlex's components:           base=${alex.base.toFixed(2)} (freq+positive)`
);
console.log(
  `  perturbation=${alex.perturbation.toFixed(2)} (recent 14-day swing)`
);
console.log(
  `  severity penalty=${alex.severityPenalty.toFixed(2)} (${alexEntries.filter((e) => (e.severity ?? 0) >= 1).length} mild-severity entries)`
);
