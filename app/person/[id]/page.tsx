'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  cadenceFor,
  closenessHistory,
  closenessState,
  trajectoryFor,
  trendReason,
  type ClosenessState,
} from '@/lib/closeness';
import { generateReading, saveReading, updatePersonContext } from '@/lib/reading';
import { removePerson, mergePerson } from '@/lib/save-entry';
import { hasLockPin, isUnlocked } from '@/lib/lock';
import { LockScreen } from '@/components/lock-screen';
import { Sparkline } from '@/components/sparkline';
import type { Entry, Person } from '@/types';

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function colorFromName(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const palette = ['#C8553D', '#6F7D63', '#8C7E5C', '#B4A689', '#A06B5C', '#7B8AA1'];
  return palette[Math.abs(hash) % palette.length]!;
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
  const annotation = trajectory ? trendReason(list, trajectory.trendShort) : '';
  const history = closenessHistory(list, 9, 7); // ~60-day weekly sample
  const cadence = cadenceFor(list);
  const rank = ranked.findIndex((p) => p.id === id) + 1; // 1-indexed; 0 if not found

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 pb-12 pt-6">
      <Topbar />

      {/* Identity */}
      <div className="mt-10 flex items-center gap-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full text-[18px] text-white"
          style={{
            background: colorFromName(person.name),
            fontFamily: 'var(--font-fraunces)',
          }}
        >
          {monogram(person.name)}
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
          annotation={annotation}
          history={history}
          rank={rank}
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
          list.map((entry) => <EntryRow key={entry.id} entry={entry} />)
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
      <span
        className="text-[15px] italic text-ink-primary"
        style={{ fontFamily: 'var(--font-fraunces)' }}
      >
        folks
      </span>
      <span aria-hidden="true" style={{ width: 18 }} />
    </header>
  );
}

function TrajectoryCard({
  state,
  trajectory,
  annotation,
  history,
  rank,
}: {
  state: ClosenessState;
  trajectory: ReturnType<typeof trajectoryFor> | null;
  annotation: string;
  history: number[];
  rank: number;
}) {
  if (state.status === 'forming') {
    return (
      <div
        className="rounded-md px-4 py-4"
        style={{ border: '0.5px solid var(--border-hair)' }}
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

  const { trendShort } = trajectory!;
  const direction: 'up' | 'down' | 'flat' =
    trendShort > 0.15 ? 'up' : trendShort < -0.15 ? 'down' : 'flat';
  const arrowIcon =
    direction === 'up'
      ? 'ti-arrow-up-right'
      : direction === 'down'
      ? 'ti-arrow-down-right'
      : 'ti-minus';
  const arrowColor =
    direction === 'up'
      ? 'var(--trend-up)'
      : direction === 'down'
      ? 'var(--trend-down)'
      : 'var(--ink-tertiary)';

  return (
    <div
      className="rounded-md px-4 py-4"
      style={{ border: '0.5px solid var(--border-hair)' }}
    >
      <div className="flex items-baseline justify-between">
        <span
          className="text-[22px] text-ink-primary"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          #{rank > 0 ? rank : '—'}{' '}
          <span className="text-[12px] italic text-ink-tertiary">in your circle</span>
        </span>
        <span
          className="flex items-center gap-1 text-[14px] font-medium"
          style={{ fontFamily: 'var(--font-mono)', color: arrowColor }}
        >
          <i className={`ti ${arrowIcon}`} style={{ fontSize: 15 }} />
          {trajectory!.now.display.toFixed(1)}
        </span>
      </div>

      {annotation && (
        <div
          className="mt-1 flex items-center gap-1.5 text-[12px] italic text-ink-secondary"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          <i
            className={`ti ${arrowIcon}`}
            style={{ fontSize: 12, color: arrowColor }}
          />
          {annotation}
        </div>
      )}

      <div className="mt-3">
        <Sparkline history={history} direction={direction} width={280} height={32} />
      </div>
    </div>
  );
}

function EntryRow({ entry }: { entry: Entry }) {
  return (
    <div
      className="py-3"
      style={{ borderBottom: '0.5px solid var(--border-hair)' }}
    >
      <div
        className="text-[10px] uppercase tracking-widest text-ink-tertiary"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {entryTime(entry.createdAt)}
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
