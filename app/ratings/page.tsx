'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  closenessState,
  trajectoryFor,
  type ClosenessState,
} from '@/lib/closeness';
import { hasLockPin, isUnlocked } from '@/lib/lock';
import { LockScreen } from '@/components/lock-screen';
import type { Person, Entry } from '@/types';

interface RankedRow {
  person: Person;
  score: number;
  delta: number;
  descriptor: string;
}

interface FormingRow {
  person: Person;
  entryCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DELTA_FLAT_THRESHOLD = 0.05;

function chevronClass(delta: number): string {
  if (delta > DELTA_FLAT_THRESHOLD) return 'ti ti-chevron-up';
  if (delta < -DELTA_FLAT_THRESHOLD) return 'ti ti-chevron-down';
  return 'ti ti-minus';
}

function chevronColor(delta: number): string {
  if (delta > DELTA_FLAT_THRESHOLD) return 'var(--accent-sage)';
  if (delta < -DELTA_FLAT_THRESHOLD) return 'var(--accent-coral)';
  return 'var(--ink-tertiary)';
}

function deltaColor(delta: number): string {
  if (delta > DELTA_FLAT_THRESHOLD) return 'var(--accent-sage)';
  if (delta < -DELTA_FLAT_THRESHOLD) return 'var(--accent-coral)';
  return 'var(--ink-tertiary)';
}

function deltaText(delta: number): string {
  if (delta > DELTA_FLAT_THRESHOLD) return `+${delta.toFixed(1)}`;
  // U+2212 minus, not hyphen
  if (delta < -DELTA_FLAT_THRESHOLD) return `−${Math.abs(delta).toFixed(1)}`;
  // em dash
  return '—';
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const segments = trimmed.split('. ');
  const head = segments[0]!.trim();
  if (head.endsWith('.') || head.endsWith('!') || head.endsWith('?')) return head;
  return head + '.';
}

function buildFallbackDescriptor(personEntries: Entry[]): string {
  const weekAgo = Date.now() - 7 * DAY_MS;
  const recent = personEntries.filter((e) => e.createdAt >= weekAgo);
  if (recent.length === 0) return 'no entries this week.';
  const tagCounts: Record<string, number> = {};
  for (const e of recent) {
    for (const t of e.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  }
  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  const topTag = sortedTags[0]?.[0];
  const countLabel = `${recent.length} ${recent.length === 1 ? 'entry' : 'entries'} this week`;
  return topTag ? `${countLabel}, mostly ${topTag}.` : `${countLabel}.`;
}

export default function RatingsPage() {
  // Lock gate — preserved
  const [unlocked, setLocalUnlocked] = useState(false);
  const [gateChecked, setGateChecked] = useState(false);
  useEffect(() => {
    if (hasLockPin() && !isUnlocked()) setLocalUnlocked(false);
    else setLocalUnlocked(true);
    setGateChecked(true);
  }, []);

  const data = useLiveQuery(
    async (): Promise<{ ranked: RankedRow[]; forming: FormingRow[] }> => {
      const [people, entries] = await Promise.all([
        db.people.filter((p) => !p.isTransient && !p.muted).toArray(),
        db.entries.toArray(),
      ]);

      const byPerson = new Map<string, Entry[]>();
      for (const e of entries) {
        if (!e.personId) continue;
        const list = byPerson.get(e.personId) ?? [];
        list.push(e);
        byPerson.set(e.personId, list);
      }

      const ranked: RankedRow[] = [];
      const forming: FormingRow[] = [];

      for (const person of people) {
        const personEntries = byPerson.get(person.id) ?? [];
        const state: ClosenessState = closenessState(personEntries);
        if (state.status === 'forming') {
          forming.push({ person, entryCount: state.entryCount });
          continue;
        }
        const trajectory = trajectoryFor(personEntries);
        const descriptor =
          person.readingText && person.readingText.trim()
            ? firstSentence(person.readingText)
            : buildFallbackDescriptor(personEntries);
        ranked.push({
          person,
          score: trajectory.now.display,
          delta: trajectory.trendShort,
          descriptor,
        });
      }

      ranked.sort((a, b) => b.score - a.score);
      forming.sort((a, b) => b.entryCount - a.entryCount);
      return { ranked, forming };
    },
    [],
    { ranked: [] as RankedRow[], forming: [] as FormingRow[] }
  );

  if (!gateChecked) {
    return <main className="mx-auto h-[100svh] w-full max-w-md overflow-y-auto" />;
  }
  if (!unlocked) {
    return (
      <LockScreen
        title="your folks are locked"
        onUnlock={() => setLocalUnlocked(true)}
      />
    );
  }

  const ranked = data.ranked;
  const forming = data.forming;
  const isEmpty = ranked.length === 0 && forming.length === 0;

  return (
    <main className="mx-auto h-[100svh] w-full max-w-md overflow-y-auto px-4 pb-12 pt-6">
      {/* Header */}
      <header>
        <Link
          href="/"
          aria-label="Back"
          className="inline-block"
          style={{ marginBottom: 14 }}
        >
          <i
            className="ti ti-arrow-left"
            style={{ fontSize: 22, color: 'var(--ink-primary)' }}
          />
        </Link>
        <div className="text-center">
          <h1
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontSize: 34,
              fontWeight: 500,
              fontStyle: 'italic',
              letterSpacing: '-0.01em',
              color: 'var(--ink-primary)',
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            your folks
          </h1>
          <p
            style={{
              marginTop: 4,
              fontFamily: 'var(--font-fraunces)',
              fontSize: 13,
              fontStyle: 'italic',
              color: 'var(--ink-secondary)',
              margin: 0,
            }}
          >
            curated by what you wrote.
          </p>
        </div>
        <div
          style={{
            marginTop: 24,
            height: '0.5px',
            background: 'var(--border-hair)',
          }}
        />
      </header>

      {/* Empty state — only when there's no one at all */}
      {isEmpty && (
        <div className="mt-16 px-2 text-center">
          <p
            className="text-[15px] italic leading-snug"
            style={{
              fontFamily: 'var(--font-fraunces)',
              color: 'var(--ink-primary)',
            }}
          >
            your folks haven't shown up yet.
          </p>
          <p
            className="mt-3 text-[13px] italic leading-snug"
            style={{
              fontFamily: 'var(--font-fraunces)',
              color: 'var(--ink-secondary)',
            }}
          >
            log a few entries on the home screen — anyone you mention by name
            appears here. they start out forming, and unlock a ranking after
            3 entries each.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-[11px] uppercase tracking-widest text-accent-coral"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            write your first entry →
          </Link>
        </div>
      )}

      {/* Ranked list */}
      {ranked.map((row) => (
        <Link
          key={row.person.id}
          href={`/person/${row.person.id}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '18px 0',
            borderBottom: '0.5px solid var(--border-hair)',
          }}
        >
          {/* Left: chevron */}
          <div
            style={{
              width: 24,
              flexShrink: 0,
              textAlign: 'center',
            }}
          >
            <i
              className={chevronClass(row.delta)}
              style={{
                fontSize: 24,
                color: chevronColor(row.delta),
              }}
              aria-hidden="true"
            />
          </div>

          {/* Middle: name + descriptor */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontSize: 22,
                fontWeight: 500,
                fontStyle: 'italic',
                lineHeight: 1.1,
                color: 'var(--ink-primary)',
              }}
            >
              {row.person.name}
            </div>
            <div
              style={{
                marginTop: 6,
                fontFamily: 'var(--font-fraunces)',
                fontSize: 14,
                fontStyle: 'italic',
                lineHeight: 1.45,
                color: 'var(--ink-secondary)',
              }}
            >
              {row.descriptor}
            </div>
          </div>

          {/* Right: score chip + delta */}
          <div
            style={{
              minWidth: 62,
              flexShrink: 0,
              textAlign: 'center',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                border: '0.5px solid var(--border-hair)',
                borderRadius: 6,
                padding: '4px 10px',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-fraunces)',
                  fontSize: 22,
                  fontWeight: 500,
                  color: 'var(--ink-primary)',
                }}
              >
                {row.score.toFixed(1)}
              </span>
            </span>
            <div
              style={{
                marginTop: 6,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 500,
                color: deltaColor(row.delta),
              }}
            >
              {deltaText(row.delta)}
            </div>
          </div>
        </Link>
      ))}

      {/* Forming section */}
      {forming.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="flex items-center gap-3">
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--ink-secondary)',
              }}
            >
              forming
            </span>
            <div
              className="flex-1"
              style={{ height: '0.5px', background: 'var(--border-hair)' }}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            {forming.map((row, i) => {
              const isLast = i === forming.length - 1;
              return (
                <Link
                  key={row.person.id}
                  href={`/person/${row.person.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 0',
                    borderBottom: isLast
                      ? 'none'
                      : '0.5px solid var(--border-hair)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-fraunces)',
                      fontSize: 19,
                      fontWeight: 500,
                      fontStyle: 'italic',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    {row.person.name}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--ink-secondary)',
                    }}
                  >
                    {row.entryCount} of 3 entries
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
