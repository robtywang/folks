'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  closenessHistory,
  closenessState,
  trajectoryFor,
  trendReason,
  type ClosenessState,
} from '@/lib/closeness';
import { seedTestData } from '@/lib/seed';
import { hasLockPin, isUnlocked } from '@/lib/lock';
import { Sparkline } from '@/components/sparkline';
import { LockScreen } from '@/components/lock-screen';
import type { Person, Entry } from '@/types';

type Direction = 'up' | 'down' | 'steady';

interface RankedRow {
  kind: 'ranked';
  person: Person;
  trendShort: number;
  annotation: string;
  extraContext: string;
  direction: Direction;
  history: number[];
  score: number;
}

interface FormingRow {
  kind: 'forming';
  person: Person;
  entryCount: number;
}

function padRank(n: number): string {
  return String(n).padStart(2, '0');
}

function directionFor(trendShort: number): Direction {
  if (trendShort >= 0.15) return 'up';
  if (trendShort <= -0.15) return 'down';
  return 'steady';
}

function sparklineStroke(d: Direction): string {
  if (d === 'up') return 'var(--accent-sage)';
  if (d === 'down') return 'var(--accent-coral)';
  return 'var(--ink-secondary)';
}

function arrowIcon(d: Direction): string | null {
  if (d === 'up') return 'ti-arrow-up-right';
  if (d === 'down') return 'ti-arrow-down-right';
  return null;
}

/**
 * Generate the optional extra-context line for rank 1 (one of the strongest
 * locally-computable signals). Returns empty string if nothing notable applies.
 */
function rank1ExtraContext(
  personId: string,
  personEntries: Entry[],
  byPersonThisMonth: Map<string, number>,
  thisMonthMine: number
): string {
  // Signal: most-written-about this month (only when there's a clear lead)
  const others = Array.from(byPersonThisMonth.entries())
    .filter(([id]) => id !== personId)
    .map(([, c]) => c);
  const maxOther = others.length > 0 ? Math.max(...others) : 0;
  if (thisMonthMine >= 3 && thisMonthMine > maxOther) {
    return 'your most-written-about this month';
  }

  // Signal: a notable amount of entries since the start of last month
  const lastMonthStart = new Date();
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
  lastMonthStart.setDate(1);
  lastMonthStart.setHours(0, 0, 0, 0);
  const lastMonthName = lastMonthStart.toLocaleDateString('en-US', {
    month: 'long',
  });
  const sinceLastMonth = personEntries.filter(
    (e) => e.createdAt >= lastMonthStart.getTime()
  ).length;
  if (sinceLastMonth >= 8) {
    return `${sinceLastMonth} entries since ${lastMonthName.toLowerCase()}`;
  }

  return '';
}

export default function RatingsPage() {
  // Lock gate
  const [unlocked, setLocalUnlocked] = useState(false);
  const [gateChecked, setGateChecked] = useState(false);
  useEffect(() => {
    if (hasLockPin() && !isUnlocked()) setLocalUnlocked(false);
    else setLocalUnlocked(true);
    setGateChecked(true);
  }, []);

  const [seeding, setSeeding] = useState(false);

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedTestData();
    } finally {
      setSeeding(false);
    }
  }

  const data = useLiveQuery(async (): Promise<{
    ranked: RankedRow[];
    forming: FormingRow[];
  }> => {
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

    // For "most-written-about this month" calculation
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const byPersonThisMonth = new Map<string, number>();
    for (const e of entries) {
      if (!e.personId) continue;
      if (e.createdAt < monthStart.getTime()) continue;
      byPersonThisMonth.set(
        e.personId,
        (byPersonThisMonth.get(e.personId) ?? 0) + 1
      );
    }

    const ranked: RankedRow[] = [];
    const forming: FormingRow[] = [];

    for (const person of people) {
      const personEntries = byPerson.get(person.id) ?? [];
      const state: ClosenessState = closenessState(personEntries);
      if (state.status === 'forming') {
        forming.push({
          kind: 'forming',
          person,
          entryCount: state.entryCount,
        });
        continue;
      }
      const trajectory = trajectoryFor(personEntries);
      const direction = directionFor(trajectory.trendShort);
      ranked.push({
        kind: 'ranked',
        person,
        trendShort: trajectory.trendShort,
        annotation: trendReason(personEntries, trajectory.trendShort),
        extraContext: '', // filled after sorting
        direction,
        history: closenessHistory(personEntries, 9, 7),
        score: trajectory.now.display,
      });
    }

    ranked.sort((a, b) => b.score - a.score);
    forming.sort((a, b) => b.entryCount - a.entryCount);

    // Fill the rank-1 extra context now that we know who #1 is
    if (ranked.length > 0) {
      const top = ranked[0]!;
      const mineCount = byPersonThisMonth.get(top.person.id) ?? 0;
      top.extraContext = rank1ExtraContext(
        top.person.id,
        byPerson.get(top.person.id) ?? [],
        byPersonThisMonth,
        mineCount
      );
    }

    return { ranked, forming };
  }, []);

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

  const ranked = data?.ranked ?? [];
  const forming = data?.forming ?? [];
  const totalRows = ranked.length + forming.length;

  return (
    <main className="mx-auto h-[100svh] w-full max-w-md overflow-y-auto px-4 pb-12 pt-6">
      {/* Top bar — minimal, just back arrow */}
      <header className="flex items-center">
        <Link
          href="/"
          aria-label="Back"
          className="text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
        </Link>
      </header>

      {/* Page header */}
      <div className="mt-10 text-center">
        <h1
          className="italic leading-none text-ink-primary"
          style={{ fontFamily: 'var(--font-fraunces)', fontSize: '32px' }}
        >
          your folks
        </h1>
        <p
          className="mt-6 italic"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: '14px',
            color: '#8C7E5C',
          }}
        >
          curated by what you wrote.
        </p>
      </div>
      <div
        className="mt-8 h-px"
        style={{ background: 'var(--border-hair)' }}
      />

      {totalRows === 0 ? (
        <div className="mt-16 px-2 text-center">
          <p
            className="text-[15px] italic leading-snug"
            style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink-primary)' }}
          >
            your folks haven't shown up yet.
          </p>
          <p
            className="mt-3 text-[13px] italic leading-snug"
            style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
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
      ) : (
        <>
          {/* Edge case: only forming entries — show the "what is forming" copy
              up top so the user understands why nothing is ranked yet. */}
          {ranked.length === 0 && forming.length > 0 && (
            <div className="mt-10 px-2 text-center">
              <p
                className="text-[14px] italic leading-snug"
                style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink-primary)' }}
              >
                your folks are forming.
              </p>
              <p
                className="mt-2 text-[12px] italic leading-snug"
                style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
              >
                ranking unlocks once each person has 3 entries. keep writing.
              </p>
            </div>
          )}

          {/* Ranked rows */}
          <div className="mt-8">
            {ranked.map((row, i) => (
              <RankedRowView
                key={row.person.id}
                row={row}
                rank={i + 1}
                // Headline treatment only if at least 2 ranked rows
                tier={i === 0 && ranked.length >= 2 ? 1 : 2}
              />
            ))}
          </div>

          {/* Forming section */}
          {forming.length > 0 && (
            <FormingSection rows={forming} hasRanked={ranked.length > 0} />
          )}
        </>
      )}
    </main>
  );
}

function RankedRowView({
  row,
  rank,
  tier,
}: {
  row: RankedRow;
  rank: number;
  tier: 1 | 2;
}) {
  const { person, annotation, extraContext, direction, history, score } = row;

  const sizes =
    tier === 1
      ? {
          rankFontSize: 28,
          nameFontSize: 32,
          annoFontSize: 17,
          sparkWidth: 80,
          scoreFontSize: 14,
          paddingTop: 48,
          paddingBottom: 40,
          dividerWidth: 1.5,
          nameItalic: true,
        }
      : {
          rankFontSize: 22,
          nameFontSize: 22,
          annoFontSize: 14,
          sparkWidth: 60,
          scoreFontSize: 13,
          paddingTop: 28,
          paddingBottom: 24,
          dividerWidth: 1,
          nameItalic: false,
        };

  const arrow = arrowIcon(direction);
  const arrowColor =
    direction === 'up'
      ? 'var(--accent-sage)'
      : direction === 'down'
      ? 'var(--accent-coral)'
      : 'var(--ink-secondary)';

  return (
    <div
      className="grid grid-cols-[52px_1fr] gap-4"
      style={{
        paddingTop: sizes.paddingTop,
        paddingBottom: sizes.paddingBottom,
        borderBottom: `${sizes.dividerWidth}px solid var(--border-hair)`,
      }}
    >
      {/* Rank */}
      <div
        className="leading-none"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: sizes.rankFontSize,
          color: '#8C7E5C',
        }}
      >
        {padRank(rank)}
      </div>

      {/* Body */}
      <div className="min-w-0">
        {/* Name + arrow on the same line */}
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={`/person/${person.id}`}
            className="block min-w-0 truncate font-medium text-ink-primary transition-opacity hover:opacity-70"
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontSize: sizes.nameFontSize,
              lineHeight: 1.1,
              fontStyle: sizes.nameItalic ? 'italic' : 'normal',
            }}
          >
            {person.name}
          </Link>
          {arrow && (
            <i
              className={`ti ${arrow} flex-shrink-0`}
              style={{ fontSize: 16, color: arrowColor }}
              aria-hidden="true"
            />
          )}
        </div>

        {/* Trend annotation */}
        {annotation && (
          <p
            className="mt-2 italic leading-snug"
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontSize: sizes.annoFontSize,
              color: '#8C7E5C',
            }}
          >
            {annotation}
          </p>
        )}

        {/* Rank 1 only: optional extra context */}
        {tier === 1 && extraContext && (
          <p
            className="mt-1 italic leading-snug"
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontSize: 14,
              color: '#8C7E5C',
            }}
          >
            {extraContext}
          </p>
        )}

        {/* Sparkline · score */}
        <div className="mt-3 flex items-center gap-3" style={{ opacity: 0.7 }}>
          <Sparkline
            history={history}
            stroke={sparklineStroke(direction)}
            width={sizes.sparkWidth}
            height={16}
          />
          <span
            className="leading-none"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: sizes.scoreFontSize,
              color: '#8C7E5C',
            }}
          >
            ·
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: sizes.scoreFontSize,
              color: 'var(--ink-primary)',
            }}
          >
            {score.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}

function FormingSection({
  rows,
  hasRanked,
}: {
  rows: FormingRow[];
  hasRanked: boolean;
}) {
  return (
    <div className="mt-10">
      {hasRanked && (
        <>
          <div
            className="h-px"
            style={{ background: 'var(--border-hair)' }}
          />
          <p
            className="ml-[52px] mt-6 italic"
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontSize: 16,
              color: '#8C7E5C',
            }}
          >
            forming
          </p>
        </>
      )}
      <div className={hasRanked ? 'mt-6' : 'mt-0'}>
        {rows.map((row, i) => (
          <FormingRowView
            key={row.person.id}
            row={row}
            isLast={i === rows.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function FormingRowView({
  row,
  isLast,
}: {
  row: FormingRow;
  isLast: boolean;
}) {
  return (
    <Link
      href={`/person/${row.person.id}`}
      className="grid grid-cols-[52px_1fr] gap-4 py-5 transition-opacity hover:opacity-70"
      style={
        isLast
          ? undefined
          : { borderBottom: '1px solid var(--border-hair)' }
      }
    >
      <div
        className="leading-none"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 22,
          color: '#8C7E5C',
        }}
      >
        ·
      </div>
      <div>
        <div
          className="truncate font-medium"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 20,
            color: '#8C7E5C',
            lineHeight: 1.15,
          }}
        >
          {row.person.name}
        </div>
        <p
          className="mt-1 italic"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 14,
            color: '#8C7E5C',
          }}
        >
          {row.entryCount} of 3 entries
        </p>
      </div>
    </Link>
  );
}
