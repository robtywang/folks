// Fixed tag vocabulary (paired positive/negative dimensions).
// Claude returns tags drawn from this list only.
export const TAG_VOCABULARY = [
  'energizing', 'draining',
  'vulnerable', 'guarded',
  'present', 'distant',
  'warm', 'cold',
  'supportive', 'exhausting',
  'fun', 'boring',
  'calm', 'anxious',
  'honest', 'performative',
  'generous', 'transactional',
  'easy', 'effortful',
] as const;

export type Tag = typeof TAG_VOCABULARY[number];

export interface Entry {
  id: string;
  createdAt: number;
  updatedAt: number;
  text: string;
  personId: string | null;       // null for solo entries
  sentiment: number;              // 1-10 from AI
  tags: string[];                 // max 3 from vocabulary
  aiConfidence: number;           // 0-1
  userConfirmed: boolean;
  additionalPeople?: string[];
  /**
   * The person name the AI originally attributed this entry to (or null for
   * solo). Captured at parse time and never mutated. Compared to the current
   * personId to detect user corrections — drives the in-context learning loop.
   */
  aiPredictedPersonName?: string | null;
}

export interface Person {
  id: string;
  createdAt: number;
  name: string;
  nickname?: string;
  relationship?: string;
  profilePicture?: string;        // base64 data URL
  closenessScore: number;
  closenessTrend: number;
  lastInteraction: number;
  entryCount: number;
  avgSentiment: number;
  muted: boolean;
  pinned: boolean;
  readingText?: string;
  readingUpdatedAt?: number;
  /**
   * Short behavioral patterns the AI inferred from entry content — e.g.
   * "coffee buddy", "running partner", "venting friend". Renders under the
   * category on the profile.
   */
  readingInferences?: string[];
  /**
   * User-written context about the person — who they are, relation, history.
   * Fed into the AI reading prompt so the model has richer info than just the
   * raw entries.
   */
  userContext?: string;
  isTransient: boolean;           // true if only one mention so far
}

export interface ParseResponse {
  primary_person: string | null;
  is_new_person: boolean;
  confidence: number;
  is_solo: boolean;
  sentiment: number;
  tags: string[];
  additional_people: string[];
  context_summary: string;
}
