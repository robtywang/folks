import { db } from './db';
import type { ParseResponse } from '@/types';

export type ParserEngine = 'mock' | 'claude';

export interface ParseOutcome {
  parsed: ParseResponse;
  engine: ParserEngine;
}

export interface Correction {
  text: string;
  aiSaid: string | null;     // what the AI guessed (null = solo)
  userSaid: string | null;   // what the user actually meant (null = solo)
}

/**
 * Pull recent user corrections so we can feed them to the parser as
 * in-context examples. A "correction" is an entry where the AI's original
 * attribution doesn't match the current attribution AND the user confirmed
 * (so we know it was an intentional fix, not an unreviewed entry).
 */
async function getRecentCorrections(limit = 5): Promise<Correction[]> {
  const [entries, people] = await Promise.all([
    db.entries.orderBy('createdAt').reverse().limit(80).toArray(),
    db.people.toArray(),
  ]);
  const peopleById = new Map(people.map((p) => [p.id, p]));

  const corrections: Correction[] = [];
  for (const e of entries) {
    if (!e.userConfirmed) continue;
    const aiSaid = e.aiPredictedPersonName ?? null;
    const userSaid = e.personId
      ? peopleById.get(e.personId)?.name ?? null
      : null;
    if (aiSaid === userSaid) continue; // not a correction
    corrections.push({ text: e.text, aiSaid, userSaid });
    if (corrections.length >= limit) break;
  }
  return corrections;
}

/**
 * Call the server-side /api/parse route to parse a user entry.
 * Falls back to the mock parser only when the server signals no API key is
 * configured (HTTP 503). All other failures throw so the UI can show them.
 */
export async function parseEntry(text: string): Promise<ParseOutcome> {
  const people = await db.people
    .filter((p) => !p.isTransient && !p.muted)
    .toArray();
  const existingPeople = people.map((p) => ({
    name: p.name,
    relationship: p.relationship,
    entryCount: p.entryCount,
    avgSentiment: p.avgSentiment,
  }));

  const corrections = await getRecentCorrections();

  const res = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, existingPeople, corrections }),
  });

  if (res.status === 503) {
    return {
      parsed: mockParse(text, people.map((p) => p.name), corrections),
      engine: 'mock',
    };
  }

  if (!res.ok) {
    throw new Error(`Parse failed (${res.status})`);
  }

  return { parsed: await res.json(), engine: 'claude' };
}

// Common sentence-starters / function words / kin / generic nouns that read
// like names but aren't.
const NON_NAMES = new Set([
  // sentence-starter verbs
  'just', 'today', 'yesterday', 'tomorrow', 'last', 'next', 'tonight',
  'had', 'saw', 'met', 'went', 'was', 'were', 'felt', 'got', 'did', 'made',
  'took', 'came', 'spent', 'talked', 'texted', 'called', 'walked', 'ran',
  'tried', 'started', 'stopped', 'thought', 'realized', 'finished', 'said',
  'hope', 'wish', 'maybe', 'probably', 'need', 'want', 'should', 'could',
  'would', 'will', 'have', 'has',
  // articles / pronouns / determiners
  'the', 'an', 'my', 'his', 'her', 'their', 'our',
  'im', 'ive', 'id', 'we', 'they', 'them', 'me', 'us', 'you',
  // days / months
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  // connectives / discourse markers
  'so', 'but', 'and', 'or', 'yet', 'because', 'then', 'though', 'still',
  'after', 'before', 'during', 'when', 'while', 'where', 'why', 'how',
  'this', 'that', 'these', 'those', 'there', 'here',
  // informal address / interjections
  'bro', 'bruh', 'dude', 'sis', 'hon', 'hun', 'babe', 'mate', 'fam', 'yo',
  'okay', 'oh', 'ah', 'eh', 'um', 'uh', 'like', 'well', 'actually',
  'anyway', 'anyways', 'honestly', 'literally', 'basically',
  // generic relational / kin nouns — could be names but usually aren't
  'mom', 'dad', 'mother', 'father', 'parents', 'parent', 'son', 'daughter',
  'sister', 'brother', 'family', 'friend', 'friends', 'guy', 'girl',
  'person', 'people', 'someone', 'somebody', 'anyone', 'anybody', 'nobody',
  'everyone', 'everybody', 'coworker', 'colleague', 'boss', 'manager',
  'doctor', 'nurse', 'teacher', 'professor', 'student', 'roommate',
  'class', 'classes', 'school', 'work', 'home', 'lunch', 'dinner', 'breakfast',
  'coffee', 'drinks', 'beer', 'wine', 'food',
]);

function normalizeCapitalization(name: string): string {
  return name[0]!.toUpperCase() + name.slice(1).toLowerCase();
}

interface Extracted {
  names: string[];
  source: 'verb-capitalized' | 'verb-lowercase' | 'capitalized' | 'none';
}

/**
 * Pull likely person names out of a raw entry. Looks for "verb + Name" patterns
 * (with/saw/met/told/and/etc) first — accepting both capitalized and lowercase
 * candidates since users type "with kate" lowercase all the time. Falls back
 * to non-stopword capitalized tokens when no verb match. Source tag tells the
 * caller how strong the signal was so confidence can be set honestly.
 */
function extractCandidateNames(text: string): Extracted {
  const verbCapitalized: string[] = [];
  const verbLowercase: string[] = [];

  const verbPattern =
    /\b(?:with|saw|met|told|texted|called|and|hung\s+out\s+with|talked\s+to|talked\s+with)\s+([a-z]\w+)/gi;
  let m: RegExpExecArray | null;
  while ((m = verbPattern.exec(text)) !== null) {
    const candidate = m[1]!;
    if (
      candidate.length < 3 ||
      candidate.length > 20 ||
      NON_NAMES.has(candidate.toLowerCase()) ||
      /^\d+$/.test(candidate)
    ) {
      continue;
    }
    const capitalized = /^[A-Z]/.test(candidate);
    const normalized = normalizeCapitalization(candidate);
    if (capitalized) verbCapitalized.push(normalized);
    else verbLowercase.push(normalized);
  }

  if (verbCapitalized.length > 0) {
    return {
      names: Array.from(new Set(verbCapitalized)),
      source: 'verb-capitalized',
    };
  }
  if (verbLowercase.length > 0) {
    return {
      names: Array.from(new Set(verbLowercase)),
      source: 'verb-lowercase',
    };
  }

  const allCaps = text.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
  const fallback = allCaps.filter((w) => !NON_NAMES.has(w.toLowerCase()));
  return {
    names: Array.from(new Set(fallback)),
    source: fallback.length > 0 ? 'capitalized' : 'none',
  };
}

/**
 * Mock parse function for offline development.
 * Heuristic: pick a name if one is mentioned, otherwise mark solo.
 * Past corrections feed back in as a dynamic stopword set — names the user
 * has reassigned away from get filtered as if they were in NON_NAMES.
 */
function mockParse(
  text: string,
  existingNames: string[],
  corrections: Correction[] = []
): ParseResponse {
  const lowered = text.toLowerCase();

  // Build a "previously wrong" set from corrections: names the AI guessed
  // that the user then changed.
  const wronglyGuessed = new Set<string>();
  for (const c of corrections) {
    if (c.aiSaid && c.aiSaid !== c.userSaid) {
      wronglyGuessed.add(c.aiSaid.toLowerCase());
    }
  }

  // Check if any existing person is mentioned (case-insensitive substring).
  for (const name of existingNames) {
    const idx = lowered.indexOf(name.toLowerCase());
    if (idx === -1) continue;
    // Require a word boundary so "Al" doesn't match inside "Already".
    const before = idx === 0 ? ' ' : lowered[idx - 1]!;
    const after =
      idx + name.length >= lowered.length
        ? ' '
        : lowered[idx + name.length]!;
    if (!/\w/.test(before) && !/\w/.test(after)) {
      return {
        primary_person: name,
        is_new_person: false,
        confidence: 0.9,
        is_solo: false,
        sentiment: heuristicSentiment(lowered),
        severity: 0,
        tags: [],
        additional_people: [],
        context_summary: text.slice(0, 40),
      };
    }
  }

  // Smart extraction for new names. Confidence depends on how we found them:
  // verb-pattern matches ("with Maya") are strong signals; capitalized-word
  // fallback is a guess and gets a low confidence so it triggers the
  // confirmation prompt.
  const extracted = extractCandidateNames(text);
  // Filter out names the user has previously corrected away from.
  const filtered = extracted.names.filter(
    (n) => !wronglyGuessed.has(n.toLowerCase())
  );
  if (filtered.length > 0) {
    // Confidence by source: capitalized verb-match is most reliable; lowercase
    // verb-match is likely but worth confirming; capitalized fallback is the
    // weakest guess.
    const confidence =
      extracted.source === 'verb-capitalized'
        ? 0.92
        : extracted.source === 'verb-lowercase'
        ? 0.65
        : 0.55;
    return {
      primary_person: filtered[0]!,
      is_new_person: true,
      confidence,
      is_solo: false,
      sentiment: heuristicSentiment(lowered),
      severity: 0,
      tags: [],
      additional_people: filtered.slice(1),
      context_summary: text.slice(0, 40),
    };
  }

  // Default to solo.
  return {
    primary_person: null,
    is_new_person: false,
    confidence: 1.0,
    is_solo: true,
    sentiment: heuristicSentiment(lowered),
    severity: 0,
    tags: [],
    additional_people: [],
    context_summary: text.slice(0, 40),
  };
}

function heuristicSentiment(text: string): number {
  const positive = /\b(love|loved|great|amazing|fun|nice|good|happy|wonderful|warm|lovely|sweet)\b/g;
  const negative = /\b(annoying|bad|terrible|awful|drained|tired|angry|frustrated|distant|weird|bad|hate|hated)\b/g;

  const posCount = (text.match(positive) || []).length;
  const negCount = (text.match(negative) || []).length;

  if (posCount > negCount) return 7;
  if (negCount > posCount) return 4;
  return 6;
}
