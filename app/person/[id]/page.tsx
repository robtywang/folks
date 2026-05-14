'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  cadenceFor,
  closenessState,
  entryImpacts,
  sentimentHistory,
  trajectoryFor,
  type ClosenessState,
} from '@/lib/closeness';
import { SentimentTrend } from '@/components/sentiment-trend';
import { generateReading, saveReading, updatePersonContext } from '@/lib/reading';
import { generateInsights, saveInsights } from '@/lib/insights';
import { removePerson, mergePerson } from '@/lib/save-entry';
import { hasLockPin, isUnlocked } from '@/lib/lock';
import { LockScreen } from '@/components/lock-screen';
import type { Entry, Person } from '@/types';

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

// Profile-page-local helpers for the redesigned trajectory card.
// Matches the chevron treatment used on /ratings exactly: ±0.05 flat threshold,
// bright sage / coral / ink-tertiary colour ramp, U+2212 minus, em-dash for flat.
const DELTA_FLAT = 0.05;
function chevronClass(delta: number): string {
  if (delta > DELTA_FLAT) return 'ti ti-chevron-up';
  if (delta < -DELTA_FLAT) return 'ti ti-chevron-down';
  return 'ti ti-minus';
}
function chevronColor(delta: number): string {
  if (delta > DELTA_FLAT) return 'var(--accent-sage)';
  if (delta < -DELTA_FLAT) return 'var(--accent-coral)';
  return 'var(--ink-tertiary)';
}
function deltaText(delta: number): string {
  if (delta > DELTA_FLAT) return `+${delta.toFixed(1)}`;
  if (delta < -DELTA_FLAT) return `−${Math.abs(delta).toFixed(1)}`;
  return '—';
}

function cadenceLastLabel(lastInteraction: number): string {
  const days = Math.floor((Date.now() - lastInteraction) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function relativeDate(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatInterval(days: number | null): string {
  if (days === null) return '—';
  if (days < 1) return 'multiple times a day';
  if (days < 1.5) return 'every day';
  if (days < 14) return `every ${Math.round(days)} days`;
  if (days < 60) return `every ${Math.round(days / 7)} weeks`;
  return `every ${Math.round(days / 30)} months`;
}

function entryTime(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function PersonProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  // Lock gate
  const [unlocked, setUnlockedState] = useState(false);
  const [gateChecked, setGateChecked] = useState(false);
  useEffect(() => {
    if (hasLockPin() && !isUnlocked()) setUnlockedState(false);
    else setUnlockedState(true);
    setGateChecked(true);
  }, []);

  // Reading state
  const [readingBusy, setReadingBusy] = useState(false);
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [readingError, setReadingError] = useState<string | null>(null);
  const [recalibrating, setRecalibrating] = useState(false);
  const [editingContext, setEditingContext] = useState(false);
  const [contextDraft, setContextDraft] = useState('');
  const [contextBusy, setContextBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Merge-into-another-person state
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeTargetInput, setMergeTargetInput] = useState('');
  const [merging, setMerging] = useState(false);

  const person = useLiveQuery(async () => db.people.get(id), [id]);
  const entries = useLiveQuery(
    async () =>
      db.entries.where('personId').equals(id).reverse().sortBy('createdAt'),
    [id]
  );
  const ranked = useLiveQuery(
    async () => {
      const arr = await db.people
        .filter((p) => !p.isTransient && !p.muted)
        .toArray();
      return arr.sort((a, b) => b.closenessScore - a.closenessScore);
    },
    [],
    []
  );
  // Separate query for the merge picker — includes muted and transient people
  // since those are often exactly the dupes the user wants to merge away.
  const allPeople = useLiveQuery(
    async () => {
      const arr = await db.people.toArray();
      return arr.sort((a, b) => b.lastInteraction - a.lastInteraction);
    },
    [],
    []
  );

  async function handleGenerateReading() {
    if (!person || !entries) return;
    setReadingBusy(true);
    setReadingError(null);
    try {
      const reading = await generateReading(person, entries);
      await saveReading(person.id, reading);
    } catch (err) {
      setReadingError(err instanceof Error ? err.message : 'failed');
    } finally {
      setReadingBusy(false);
    }
  }

  function openContextEditor() {
    setContextDraft(person?.userContext ?? '');
    setEditingContext(true);
  }

  async function saveContext() {
    if (!person) return;
    setContextBusy(true);
    try {
      await updatePersonContext(person.id, contextDraft);
      setEditingContext(false);
    } finally {
      setContextBusy(false);
    }

    // Auto-recalibrate the reading with the new context if there's enough data.
    // Fetches the fresh person record so the context just saved is included.
    if ((entries?.length ?? 0) >= 5) {
      setRecalibrating(true);
      try {
        const fresh = await db.people.get(id);
        if (fresh && entries) {
          const reading = await generateReading(fresh, entries);
          await saveReading(fresh.id, reading);
        }
      } catch (err) {
        console.warn('Auto-recalibrate failed:', err);
      } finally {
        setRecalibrating(false);
      }
    }
  }

  async function handleGenerateInsights() {
    if (!person || !entries) return;
    setInsightsBusy(true);
    setInsightsError(null);
    try {
      const r = await generateInsights(person, entries);
      if (r) await saveInsights(person.id, r);
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : 'failed');
    } finally {
      setInsightsBusy(false);
    }
  }

  async function handleRemovePerson() {
    setRemoving(true);
    try {
      await removePerson(id);
      router.push('/ratings');
    } catch (err) {
      console.error('Remove failed:', err);
    } finally {
      setRemoving(false);
    }
  }

  async function handleMergeInto(targetId: string) {
    setMerging(true);
    try {
      await mergePerson(id, targetId);
      // Navigate to the surviving person's profile so the user can see the
      // combined entries immediately.
      router.replace(`/person/${targetId}`);
    } catch (err) {
      console.error('Merge failed:', err);
    } finally {
      setMerging(false);
    }
  }

  if (!gateChecked) return <main className="mx-auto min-h-screen w-full max-w-md" />;
  if (!unlocked) {
    return (
      <LockScreen
        title="this profile is locked"
        onUnlock={() => setUnlockedState(true)}
      />
    );
  }
  if (person === undefined) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-md px-4 pb-12 pt-6">
        <Topbar />
      </main>
    );
  }
  if (!person) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-md px-4 pb-12 pt-6">
        <Topbar />
        <div
          className="mt-20 text-center text-[14px] italic text-ink-tertiary"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          person not found
        </div>
      </main>
    );
  }

  const list = entries ?? [];
  const state = closenessState(list);
  const trajectory = state.status === 'stable' ? trajectoryFor(list) : null;
  const sentimentTrend = sentimentHistory(list, 12); // 12-week sentiment chart
  const cadence = cadenceFor(list);
  const impacts = entryImpacts(list); // entry.id → closeness delta from that entry
  const rank = ranked.findIndex((p) => p.id === id) + 1; // 1-indexed; 0 if not found

  return (
    <main className="mx-auto flex h-[100svh] w-full max-w-md flex-col overflow-hidden px-4 pt-6">
      <Topbar />

      {/* Scrollable content area — page itself is locked, only this region
          moves so the topbar stays fixed in view. */}
      <div className="-mx-4 flex-1 overflow-y-auto px-4 pb-12">

      {/* Identity */}
      <div className="mt-10 flex items-center gap-4">
        <div
          className="flex items-center justify-center"
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            border: '0.5px solid var(--border-hair)',
            background: 'transparent',
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
            {monogram(person.name)}
          </span>
        </div>
        <div className="flex-1">
          <h1
            className="text-[24px] text-ink-primary"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            {person.name}
          </h1>
          <div
            className="mt-0.5 text-[13px] italic text-ink-secondary"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            {person.relationship ?? (
              <span className="text-ink-tertiary">no category yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Inference chips */}
      {person.readingInferences && person.readingInferences.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {person.readingInferences.map((label) => (
            <span
              key={label}
              className="rounded-full border px-2.5 py-0.5 text-[11px] italic text-ink-secondary"
              style={{
                borderColor: 'var(--border-hair)',
                fontFamily: 'var(--font-fraunces)',
              }}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Who is X */}
      <div className="mt-8">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span
            className="text-[10px] uppercase tracking-widest text-ink-secondary"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            who is {person.name.toLowerCase()}
          </span>
          <div className="h-px flex-1" style={{ background: 'var(--border-hair)' }} />
          {!editingContext && (
            <button
              onClick={openContextEditor}
              className="text-[10px] uppercase tracking-widest text-accent-coral transition-opacity hover:opacity-70"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {person.userContext ? 'edit' : 'add →'}
            </button>
          )}
        </div>

        {editingContext ? (
          <div>
            <textarea
              value={contextDraft}
              onChange={(e) => setContextDraft(e.target.value)}
              placeholder="describe who they are, your relation, history."
              rows={4}
              disabled={contextBusy}
              className="w-full resize-none rounded-md border bg-white/40 px-4 py-3 text-[13px] italic leading-snug text-ink-primary placeholder:text-ink-tertiary focus:outline-none"
              style={{
                fontFamily: 'var(--font-fraunces)',
                borderColor: 'var(--border-hair)',
              }}
            />
            <div className="mt-2 flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingContext(false)}
                disabled={contextBusy}
                className="text-[11px] uppercase tracking-widest text-ink-secondary"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                cancel
              </button>
              <button
                onClick={saveContext}
                disabled={contextBusy}
                className="text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-40"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {contextBusy ? 'saving…' : 'save →'}
              </button>
            </div>
          </div>
        ) : person.userContext ? (
          <p
            className="text-[14px] italic leading-snug text-ink-primary"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            {person.userContext}
          </p>
        ) : (
          <p
            className="text-[13px] italic text-ink-tertiary"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            describe who they are, your relation, history.
          </p>
        )}
      </div>

      {/* The Reading */}
      <div className="mt-10">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span
            className="text-[10px] uppercase tracking-widest text-ink-secondary"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            the reading
          </span>
          <div className="h-px flex-1" style={{ background: 'var(--border-hair)' }} />
          {recalibrating ? (
            <span
              className="text-[10px] uppercase tracking-widest text-ink-tertiary"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              recalibrating…
            </span>
          ) : (
            person.readingText &&
            list.length >= 5 && (
              <button
                onClick={handleGenerateReading}
                disabled={readingBusy}
                className="text-[10px] uppercase tracking-widest text-accent-coral disabled:opacity-40"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {readingBusy ? 'thinking…' : 'rerun ↻'}
              </button>
            )
          )}
        </div>

        <div
          className="rounded-md px-4 py-4"
          style={{
            background: 'rgba(140, 126, 92, 0.06)',
            border: '0.5px solid var(--border-hair)',
          }}
        >
          {list.length < 5 ? (
            <p
              className="text-[14px] italic leading-snug text-ink-tertiary"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              log {5 - list.length} more{' '}
              {5 - list.length === 1 ? 'entry' : 'entries'} to unlock a reading.
            </p>
          ) : person.readingText ? (
            <>
              <p
                className="text-[14px] italic leading-snug text-ink-primary"
                style={{ fontFamily: 'var(--font-fraunces)' }}
              >
                {person.readingText}
              </p>
              {person.readingUpdatedAt && (
                <div
                  className="mt-2 text-[9px] uppercase tracking-widest text-ink-tertiary"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  updated {relativeDate(person.readingUpdatedAt)}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p
                className="text-[14px] italic leading-snug text-ink-tertiary"
                style={{ fontFamily: 'var(--font-fraunces)' }}
              >
                no reading yet — generate one from your entries.
              </p>
              <button
                onClick={handleGenerateReading}
                disabled={readingBusy}
                className="flex-shrink-0 text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-40"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {readingBusy ? 'thinking…' : 'generate →'}
              </button>
            </div>
          )}
          {readingError && (
            <p
              className="mt-2 text-[11px] italic text-accent-coral"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              {readingError}
            </p>
          )}
        </div>
      </div>

      {/* Trajectory card — hinge between qualitative (Reading) and raw (Entries) */}
      <div className="mt-10">
        <div className="mb-2 flex items-center gap-3">
          <span
            className="text-[10px] uppercase tracking-widest text-ink-secondary"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            trajectory
          </span>
          <div className="h-px flex-1" style={{ background: 'var(--border-hair)' }} />
        </div>
        <TrajectoryCard
          state={state}
          trajectory={trajectory}
          rank={rank}
          entries={list}
          cadence={cadence}
          impacts={impacts}
        />
        {trajectory && trajectory.trendLong < -0.5 && (
          <p
            className="mt-2 px-1 text-[11px] italic leading-snug text-ink-tertiary"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            trending down over the past month.
          </p>
        )}
      </div>

      {/* Analytics — sentiment trend + AI insight cards.
          Gated at 3 entries: below that, charts are noise and insights would
          hallucinate. We show a soft locked state instead so the user sees
          progress toward unlocking. */}
      {list.length > 0 && (
        <div className="mt-10">
          <div className="mb-2 flex items-center gap-3">
            <span
              className="text-[10px] uppercase tracking-widest text-ink-secondary"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              analytics
            </span>
            <div className="h-px flex-1" style={{ background: 'var(--border-hair)' }} />
          </div>

          {list.length < 3 ? (
            <div
              className="rounded-md px-3 py-3"
              style={{
                background: 'rgba(140, 126, 92, 0.06)',
                border: '0.5px solid var(--border-hair)',
              }}
            >
              <p
                className="text-[13px] italic leading-snug text-ink-primary"
                style={{ fontFamily: 'var(--font-fraunces)' }}
              >
                analytics unlock at 3 entries.
              </p>
              <p
                className="mt-1 text-[11px] italic leading-snug text-ink-tertiary"
                style={{ fontFamily: 'var(--font-fraunces)' }}
              >
                {3 - list.length === 1
                  ? 'one more entry about ' + person.name.toLowerCase() + ' to see patterns appear.'
                  : `${3 - list.length} more entries about ${person.name.toLowerCase()} to see patterns appear.`}
              </p>
            </div>
          ) : (
            <>
              <SentimentTrend
                buckets={sentimentTrend.buckets}
                lifetimeAvg={sentimentTrend.lifetimeAvg}
                recentAvg={sentimentTrend.recentAvg}
                delta={sentimentTrend.delta}
              />

              {/* AI insight cards */}
              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="text-[10px] uppercase tracking-widest text-ink-tertiary"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    patterns
                  </span>
                  {(person.insightCards?.length ?? 0) > 0 && (
                    <button
                      onClick={handleGenerateInsights}
                      disabled={insightsBusy}
                      className="text-[10px] uppercase tracking-widest text-accent-coral disabled:opacity-50"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {insightsBusy ? 'thinking…' : 'rerun ↻'}
                    </button>
                  )}
                </div>

                {person.insightCards && person.insightCards.length > 0 ? (
                  <ul className="space-y-2">
                    {person.insightCards.map((insight, i) => (
                      <li
                        key={i}
                        className="rounded-md px-3 py-2 text-[13px] italic leading-snug text-ink-primary"
                        style={{
                          fontFamily: 'var(--font-fraunces)',
                          background: 'rgba(140, 126, 92, 0.06)',
                          borderLeft: '2px solid var(--ink-tertiary)',
                        }}
                      >
                        {insight}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center justify-between">
                    <p
                      className="text-[12px] italic text-ink-tertiary"
                      style={{ fontFamily: 'var(--font-fraunces)' }}
                    >
                      surface patterns the ai sees in your entries.
                    </p>
                    <button
                      onClick={handleGenerateInsights}
                      disabled={insightsBusy}
                      className="text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-50"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {insightsBusy ? 'thinking…' : 'generate →'}
                    </button>
                  </div>
                )}

                {insightsError && (
                  <p
                    className="mt-2 text-[11px] italic text-accent-coral"
                    style={{ fontFamily: 'var(--font-fraunces)' }}
                  >
                    {insightsError}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Entry timeline — the substance */}
      <div className="mt-10">
        <div className="mb-2 flex items-center gap-3">
          <span
            className="text-[10px] uppercase tracking-widest text-ink-secondary"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            entries
          </span>
          <div className="h-px flex-1" style={{ background: 'var(--border-hair)' }} />
        </div>
        {list.length === 0 ? (
          <div
            className="py-6 text-center text-[13px] italic text-ink-tertiary"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            no entries yet
          </div>
        ) : (
          list.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              impact={impacts.get(entry.id) ?? 0}
            />
          ))
        )}
      </div>

      {/* Cadence footer */}
      {list.length > 0 && (
        <p
          className="mt-6 text-center text-[12px] italic leading-snug text-ink-tertiary"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          last logged {relativeDate(cadence.lastInteraction!)}
          {cadence.avgIntervalDays !== null && (
            <> · {formatInterval(cadence.avgIntervalDays)}</>
          )}{' '}
          · {cadence.total} {cadence.total === 1 ? 'entry' : 'entries'} total
        </p>
      )}

      {/* Merge picker */}
      {mergeMode && (() => {
        const personFirst = person.name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
        // Pull from the unfiltered list so we can merge into muted/transient dupes too.
        const otherPeople = (allPeople ?? []).filter((p) => p.id !== id);
        const sameFirst = otherPeople.filter(
          (p) =>
            (p.name.trim().split(/\s+/)[0]?.toLowerCase() ?? '') === personFirst
        );
        const typed = mergeTargetInput.trim().toLowerCase();
        const filtered = typed
          ? otherPeople.filter((p) => p.name.toLowerCase().includes(typed))
          : [];
        return (
          <div
            className="mt-10 rounded-md px-3 py-3"
            style={{
              background: 'rgba(140, 126, 92, 0.06)',
              border: '0.5px solid var(--border-hair)',
            }}
          >
            <div
              className="text-[10px] uppercase tracking-widest text-ink-secondary"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              merge {person.name.toLowerCase()} into
            </div>
            <p
              className="mt-1 text-[12px] italic leading-snug"
              style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
            >
              all entries move to the person you pick. {person.name} is then deleted.
            </p>

            {sameFirst.length > 0 && (
              <div className="mt-3">
                <div
                  className="mb-1 text-[10px] uppercase tracking-widest text-ink-tertiary"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  same first name
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sameFirst.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleMergeInto(p.id)}
                      disabled={merging}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-opacity hover:opacity-70 disabled:opacity-40"
                      style={{
                        borderColor: 'var(--border-hair)',
                        background: 'rgba(200, 85, 61, 0.08)',
                        color: 'var(--accent-coral)',
                        fontFamily: 'var(--font-fraunces)',
                      }}
                    >
                      {p.name}
                      <span
                        className="text-[9px] uppercase tracking-widest text-ink-tertiary"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {p.entryCount}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3">
              <input
                value={mergeTargetInput}
                onChange={(e) => setMergeTargetInput(e.target.value)}
                placeholder="or search any name…"
                className="w-full bg-transparent py-1.5 text-[13px] text-ink-primary placeholder:italic placeholder:text-ink-tertiary focus:outline-none"
                style={{
                  fontFamily: 'var(--font-fraunces)',
                  borderBottom: '0.5px solid var(--border-hair)',
                }}
              />
              {filtered.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {filtered.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleMergeInto(p.id)}
                      disabled={merging}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-opacity hover:opacity-70 disabled:opacity-40"
                      style={{
                        borderColor: 'var(--border-hair)',
                        fontFamily: 'var(--font-fraunces)',
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 flex justify-end">
              <button
                onClick={() => {
                  setMergeMode(false);
                  setMergeTargetInput('');
                }}
                disabled={merging}
                className="text-[11px] uppercase tracking-widest text-ink-secondary"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Quiet remove link */}
      <div className="mt-6 flex items-center justify-center gap-4">
        {!confirmRemove && !mergeMode ? (
          <>
            <button
              onClick={() => setMergeMode(true)}
              className="text-[11px] italic text-ink-tertiary transition-colors hover:text-accent-coral"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              merge {person.name.toLowerCase()} into another
            </button>
            <span className="text-ink-tertiary" aria-hidden="true">·</span>
            <button
              onClick={() => setConfirmRemove(true)}
              className="text-[11px] italic text-ink-tertiary transition-colors hover:text-accent-coral"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              remove from circle
            </button>
          </>
        ) : confirmRemove ? (
          <div
            className="w-full rounded-md px-3 py-3"
            style={{
              background: 'rgba(200, 85, 61, 0.07)',
              borderLeft: '2px solid var(--accent-coral)',
            }}
          >
            <div
              className="text-[12px] italic leading-snug text-ink-primary"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              remove {person.name} from your circle? entries are kept but become solo.
            </div>
            <div className="mt-3 flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmRemove(false)}
                disabled={removing}
                className="text-[11px] uppercase tracking-widest text-ink-secondary"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                cancel
              </button>
              <button
                onClick={handleRemovePerson}
                disabled={removing}
                className="text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-40"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {removing ? 'removing…' : 'confirm'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      </div>
    </main>
  );
}

function Topbar() {
  const router = useRouter();

  function goBack() {
    // Prefer router history so we land back on /journal or /ratings depending
    // on where the user came from. Fall back to / for cold-loaded profiles
    // (deep link, bookmark, etc.) with no in-app history.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  }

  return (
    <header className="flex items-center justify-between">
      <button
        onClick={goBack}
        aria-label="Back"
        className="text-ink-secondary transition-colors hover:text-ink-primary"
      >
        <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
      </button>
      {/* Empty centre + right spacer; back arrow stays anchored left without
          a title competing for attention. */}
      <span aria-hidden="true" />
      <span aria-hidden="true" style={{ width: 18 }} />
    </header>
  );
}

function TrajectoryCard({
  state,
  trajectory,
  rank,
  entries,
  cadence,
  impacts,
}: {
  state: ClosenessState;
  trajectory: ReturnType<typeof trajectoryFor> | null;
  rank: number;
  entries: Entry[];
  cadence: ReturnType<typeof cadenceFor>;
  impacts: Map<string, number>;
}) {
  if (state.status === 'forming') {
    return (
      <div
        className="rounded-md"
        style={{
          border: '0.5px solid var(--border-hair)',
          padding: 18,
        }}
      >
        <div
          className="text-[10px] uppercase tracking-widest text-ink-tertiary"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          forming
        </div>
        <p
          className="mt-1 text-[14px] italic leading-snug text-ink-secondary"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          log {3 - state.entryCount} more{' '}
          {3 - state.entryCount === 1 ? 'entry' : 'entries'} to see a closeness
          reading.
        </p>
      </div>
    );
  }

  const score = trajectory!.now.display;
  const delta = trajectory!.trendShort;

  // Cumulative closeness at each entry: walk entries chronologically and
  // accumulate the per-entry impact. By construction this sums to the
  // current closeness (entryImpacts is computed exactly that way), so the
  // chart's last y value matches the chip's score.
  const ascending = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const ys: number[] = [];
  let cum = 0;
  for (const e of ascending) {
    cum += impacts.get(e.id) ?? 0;
    ys.push(cum);
  }

  return (
    <div
      className="rounded-md"
      style={{
        border: '0.5px solid var(--border-hair)',
        padding: 18,
      }}
    >
      {/* Header row — rank left, score chip + delta right */}
      {rank > 0 && (
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 24,
                fontWeight: 500,
                color: 'var(--ink-primary)',
              }}
            >
              #{rank}
            </span>
            <span
              style={{
                marginLeft: 6,
                fontFamily: 'var(--font-fraunces)',
                fontSize: 14,
                fontStyle: 'italic',
                color: 'var(--ink-secondary)',
              }}
            >
              in your circle
            </span>
          </div>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
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
                {score.toFixed(1)}
              </span>
            </span>
            <div
              style={{
                marginTop: 6,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 500,
                color: chevronColor(delta),
              }}
            >
              {deltaText(delta)}
            </div>
          </div>
        </div>
      )}

      {/* Cadence line */}
      {cadence.lastInteraction !== null &&
        cadence.avgIntervalDays !== null && (
          <div
            style={{
              marginTop: 14,
              fontFamily: 'var(--font-fraunces)',
              fontSize: 13,
              fontStyle: 'italic',
              color: 'var(--ink-secondary)',
            }}
          >
            last interaction: {cadenceLastLabel(cadence.lastInteraction)} ·
            typically {formatInterval(cadence.avgIntervalDays)}
          </div>
        )}

      {/* Trajectory chart */}
      <div style={{ marginTop: 18 }}>
        {ys.length === 0 ? (
          <p
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontSize: 14,
              fontStyle: 'italic',
              color: 'var(--ink-tertiary)',
              textAlign: 'center',
              padding: '30px 0',
              margin: 0,
            }}
          >
            no entries yet.
          </p>
        ) : (
          <TrajectoryChart ys={ys} />
        )}
      </div>

      {/* Chart footer */}
      {ys.length > 0 && (
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
          }}
        >
          <span style={{ color: 'var(--ink-secondary)' }}>
            first → most recent
          </span>
          <span style={{ color: 'var(--ink-primary)' }}>
            {ys[0]!.toFixed(1)} → {ys[ys.length - 1]!.toFixed(1)}
          </span>
        </div>
      )}
    </div>
  );
}

function TrajectoryChart({ ys }: { ys: number[] }) {
  const W = 320;
  const H = 90;
  const PAD_X = 4;
  const PAD_Y = 8;

  // Single entry: just a centered dot, no line.
  if (ys.length === 1) {
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <circle cx={W / 2} cy={H / 2} r={2.5} fill="var(--accent-sage)" />
      </svg>
    );
  }

  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // Auto-fit y range with 10% padding. Enforce a minimum range so a tiny
  // wobble on a sparse profile doesn't look like a cliff.
  let yRange = Math.max(maxY - minY, 2.0);
  const yPad = yRange * 0.1;
  const yLow = minY - yPad;
  const yHigh = maxY + yPad + (yRange - (maxY - minY));
  const yScale = (y: number) =>
    H - PAD_Y - ((y - yLow) / (yHigh - yLow)) * (H - PAD_Y * 2);

  const points = ys.map((y, i) => ({
    x: PAD_X + (i / (ys.length - 1)) * (W - PAD_X * 2),
    y: yScale(y),
  }));
  const polyline = points
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');
  const showDots = ys.length <= 25;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <polyline
        points={polyline}
        fill="none"
        stroke="var(--accent-sage)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDots &&
        points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill="var(--accent-sage)"
          />
        ))}
    </svg>
  );
}

function EntryRow({ entry, impact }: { entry: Entry; impact: number }) {
  const impactRounded = Math.round(impact * 10) / 10;
  const showImpact = Math.abs(impactRounded) >= 0.1;
  const impactColor =
    impactRounded > 0
      ? 'var(--accent-sage)'
      : impactRounded < 0
        ? 'var(--accent-coral)'
        : 'var(--ink-tertiary)';
  const impactGlyph = impactRounded > 0 ? '+' : impactRounded < 0 ? '−' : '·';

  return (
    <div
      className="py-3"
      style={{ borderBottom: '0.5px solid var(--border-hair)' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div
          className="text-[10px] uppercase tracking-widest text-ink-tertiary"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {entryTime(entry.createdAt)}
        </div>
        {showImpact && (
          <span
            className="text-[10px] tabular-nums"
            style={{ fontFamily: 'var(--font-mono)', color: impactColor }}
            title="how this entry moved closeness"
          >
            {impactGlyph}
            {Math.abs(impactRounded).toFixed(1)}
          </span>
        )}
      </div>
      <p
        className="mt-1 text-[14px] italic leading-snug text-ink-primary"
        style={{ fontFamily: 'var(--font-fraunces)' }}
      >
        "{entry.text}"
      </p>
    </div>
  );
}
