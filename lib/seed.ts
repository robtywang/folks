import { db, uuid, createPerson } from './db';
import { recomputeAll } from './closeness';
import type { Entry } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

interface SeedEntry {
  daysAgo: number;
  text: string;
  sentiment: number;
  tags: string[];
}

interface SeedPerson {
  name: string;
  relationship: string;
  entries: SeedEntry[];
}

const SEED_PEOPLE: SeedPerson[] = [
  {
    name: 'Maya',
    relationship: 'close friend',
    entries: [
      {
        daysAgo: 2,
        text: 'had coffee with maya this morning — she was really present, no phone, just talking. felt warm in a way i haven\'t in a while.',
        sentiment: 9,
        tags: ['warm', 'present'],
      },
      {
        daysAgo: 7,
        text: 'maya called when she heard about the breakup. she didn\'t try to fix anything, just listened for an hour.',
        sentiment: 9,
        tags: ['supportive', 'vulnerable'],
      },
      {
        daysAgo: 14,
        text: 'maya was a bit distant tonight. seemed stressed about work, didn\'t really want to be there.',
        sentiment: 5,
        tags: ['distant'],
      },
      {
        daysAgo: 21,
        text: 'walked with maya in the park for an hour, talked about nothing in particular. easiest hang i\'ve had in months.',
        sentiment: 8,
        tags: ['easy', 'warm'],
      },
    ],
  },
  {
    name: 'Ravi',
    relationship: 'coworker',
    entries: [
      {
        daysAgo: 1,
        text: 'ravi stayed two hours past standup to help me debug. genuinely generous with his time.',
        sentiment: 8,
        tags: ['supportive', 'generous'],
      },
      {
        daysAgo: 4,
        text: 'ravi venting about his manager for the third time this week. starting to drain me.',
        sentiment: 4,
        tags: ['draining'],
      },
      {
        daysAgo: 9,
        text: 'caught up with ravi over lunch. easier than i expected, we actually talked about non-work stuff.',
        sentiment: 7,
        tags: ['easy'],
      },
      {
        daysAgo: 16,
        text: 'ravi reached out about the side project idea — feels like it might actually be a thing now.',
        sentiment: 7,
        tags: ['present'],
      },
      {
        daysAgo: 26,
        text: 'ravi being weirdly competitive in standup again. not sure if it\'s about me or just how he is.',
        sentiment: 4,
        tags: ['performative'],
      },
    ],
  },
  {
    name: 'Alex',
    relationship: 'old friend',
    entries: [
      {
        daysAgo: 5,
        text: 'alex called out of nowhere. was good to hear from them, even if it was brief.',
        sentiment: 7,
        tags: ['warm'],
      },
      {
        daysAgo: 32,
        text: 'lunch with alex felt forced. not sure if there\'s still anything keeping us connected.',
        sentiment: 4,
        tags: ['effortful'],
      },
    ],
  },
  {
    name: 'Sam',
    relationship: 'sister',
    entries: [
      {
        daysAgo: 3,
        text: 'sam\'s birthday. sent a long text, no reply yet but i know how she is about her phone.',
        sentiment: 6,
        tags: ['present'],
      },
      {
        daysAgo: 18,
        text: 'video call with sam — she seems more settled lately. happy for her.',
        sentiment: 8,
        tags: ['warm', 'present'],
      },
      {
        daysAgo: 46,
        text: 'sam asked about mom out of nowhere. felt like a real conversation, the kind we used to have.',
        sentiment: 7,
        tags: ['vulnerable', 'honest'],
      },
    ],
  },
  {
    name: 'Jordan',
    relationship: 'friend',
    entries: [
      {
        daysAgo: 1,
        text: 'dinner with jordan tonight. complained the entire time about the same situation. left feeling drained.',
        sentiment: 3,
        tags: ['draining', 'exhausting'],
      },
      {
        daysAgo: 6,
        text: 'another long text from jordan at 1am, same topic. not sure how much longer i can be the sounding board.',
        sentiment: 3,
        tags: ['exhausting'],
      },
      {
        daysAgo: 12,
        text: 'jordan canceled plans an hour before — fourth time this month. starting to feel like a pattern.',
        sentiment: 4,
        tags: ['performative'],
      },
    ],
  },
];

const SEED_SOLO: SeedEntry[] = [
  {
    daysAgo: 2,
    text: 'studied at the cafe alone for three hours. productive in a way that felt earned.',
    sentiment: 7,
    tags: ['calm'],
  },
  {
    daysAgo: 9,
    text: 'long run before work. cleared my head more than usual.',
    sentiment: 8,
    tags: ['energizing'],
  },
];

/**
 * Populate the local Dexie store with five people and ~17 entries spread
 * across recency/sentiment. Doesn't clear anything first — meant to be called
 * on an empty DB. Run delete-all first if re-seeding.
 */
export async function seedTestData(): Promise<{
  peopleAdded: number;
  entriesAdded: number;
}> {
  const now = Date.now();
  let peopleAdded = 0;
  let entriesAdded = 0;

  for (const seedPerson of SEED_PEOPLE) {
    const person = await createPerson(seedPerson.name, { isTransient: false });
    await db.people.update(person.id, {
      relationship: seedPerson.relationship,
    });
    peopleAdded++;

    for (const seedEntry of seedPerson.entries) {
      const ts = now - seedEntry.daysAgo * DAY_MS;
      const entry: Entry = {
        id: uuid(),
        createdAt: ts,
        updatedAt: ts,
        text: seedEntry.text,
        personId: person.id,
        sentiment: seedEntry.sentiment,
        tags: seedEntry.tags,
        aiConfidence: 1.0,
        userConfirmed: true,
      };
      await db.entries.put(entry);
      entriesAdded++;
    }
  }

  for (const seedEntry of SEED_SOLO) {
    const ts = now - seedEntry.daysAgo * DAY_MS;
    const entry: Entry = {
      id: uuid(),
      createdAt: ts,
      updatedAt: ts,
      text: seedEntry.text,
      personId: null,
      sentiment: seedEntry.sentiment,
      tags: seedEntry.tags,
      aiConfidence: 1.0,
      userConfirmed: true,
    };
    await db.entries.put(entry);
    entriesAdded++;
  }

  await recomputeAll();
  return { peopleAdded, entriesAdded };
}
