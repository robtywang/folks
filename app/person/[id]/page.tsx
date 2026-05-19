'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { cadenceFor } from '@/lib/closeness';
import { detectPatterns, type DetectedPattern } from '@/lib/insights';
import { generateReading, saveReading, updatePersonContext } from '@/lib/reading';
import { removePerson, mergePerson } from '@/lib/save-entry';
import { hasLockPin, isUnlocked } from '@/lib/lock';
import { LockScreen } from '@/components/lock-screen';
import type { Entry } from '@/types';

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
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
  // For the merge picker — includes muted and transient people since those
  // are often exactly the dupes the user wants to merge away.
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
      router.push('/');
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
        <Topbar personName={undefined} />
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
  const cadence = cadenceFor(list);

  // Quick sentiment summary derived from the person's avg sentiment.
  // Drives the analytic chip under the identity header.
  function sentimentTone(avg: number, count: number): string {
    if (count === 0) return 'no entries yet';
    if (avg >= 7) return 'mostly warm';
    if (avg >= 5.5) return 'mixed, leaning warm';
    if (avg >= 4) return 'mixed, leaning heavy';
    return 'mostly heavy';
  }

  return (
    <main className="mx-auto flex h-[100svh] w-full max-w-md flex-col overflow-hidden px-4 pt-6">
      <Topbar personName={person.name} />

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

      {/* Sentiment analytic — quick at-a-glance read on the relationship.
          Mono uppercase row: tone · entry count · last seen. */}
      <div
        className="mt-4 flex flex-wrap items-center"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--ink-tertiary)',
          gap: 10,
        }}
      >
        <span style={{ color: 'var(--accent-coral)' }}>
          {sentimentTone(person.avgSentiment, person.entryCount)}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {person.entryCount}{' '}
          {person.entryCount === 1 ? 'entry' : 'entries'}
        </span>
        {cadence.lastInteraction !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span>last {relativeDate(cadence.lastInteraction)}</span>
          </>
        )}
      </div>

      {/* Sentiment tracker — visual analytic showing how the relationship
          has felt over time. Only renders when there are at least 3 entries
          so the chart is meaningful. */}
      {list.length >= 3 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-3">
            <span
              className="text-[10px] uppercase tracking-widest text-ink-secondary"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              sentiment over time
            </span>
            <div className="h-px flex-1" style={{ background: 'var(--border-hair)' }} />
          </div>
          <SentimentTracker entries={list} />
        </div>
      )}

      {/* Patterns — surfaced from the local pattern-detection agent in
          lib/insights.ts. Pure JS detection (no LLM call) finds
          statistical patterns above min-cohort + min-delta thresholds.
          Renders as tan mono chips so the user can see what the agent
          has actually noticed without any AI inference cost. */}
      {(() => {
        const patterns = detectPatterns(list);
        if (patterns.length === 0) return null;
        return (
          <div className="mt-8">
            <div className="mb-3 flex items-center gap-3">
              <span
                className="text-[10px] uppercase tracking-widest text-ink-secondary"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                patterns
              </span>
              <div
                className="h-px flex-1"
                style={{ background: 'var(--border-hair)' }}
              />
            </div>
            <div className="flex flex-wrap" style={{ gap: 8 }}>
              {patterns.map((p, i) => (
                <PatternChip key={i} pattern={p} />
              ))}
            </div>
          </div>
        );
      })()}

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

      {/* AI's read on the relationship — the narrative companion to the
          quantitative summary above. Generated from the entries. */}
      <div className="mt-10">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span
            className="text-[10px] uppercase tracking-widest text-ink-secondary"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            what folks has noticed
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


      {/* Entry timeline — the heart of the friend journal */}
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
      </div>
    </main>
  );
}

function Topbar({ personName }: { personName?: string }) {
  const router = useRouter();

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/journal');
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
        {personName ? `journal about ${personName.toLowerCase()}` : 'friend journal'}
      </span>
      <span aria-hidden="true" style={{ width: 18 }} />
    </header>
  );
}

/**
 * Sentiment tracker — a soft area chart of sentiment values over time.
 * Renders the last N entries (oldest left → newest right) as a smoothed
 * curve with a tinted area underneath. Color comes from the position of
 * each value: above 5.5 = sage (warm), below = coral (heavy).
 */
function SentimentTracker({ entries }: { entries: Entry[] }) {
  const W = 320;
  const H = 90;
  const PAD_X = 6;
  const PAD_Y = 10;
  const MIDLINE_Y = H / 2;

  // Oldest left, newest right. Cap at last 16 so the chart stays legible.
  const points = [...entries]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-16)
    .map((e) => ({
      sentiment: e.sentiment,
      createdAt: e.createdAt,
    }));
  if (points.length === 0) return null;

  const scaleX = (i: number): number => {
    if (points.length === 1) return W / 2;
    return PAD_X + (i / (points.length - 1)) * (W - PAD_X * 2);
  };
  // Sentiment 1..10 → top..bottom of chart. 10 = highest = top.
  const scaleY = (s: number): number => {
    const norm = (s - 1) / 9; // 0..1
    return H - PAD_Y - norm * (H - PAD_Y * 2);
  };

  const coords = points.map((p, i) => ({ x: scaleX(i), y: scaleY(p.sentiment), s: p.sentiment }));

  // Smooth path using Catmull-Rom → Bezier conversion for an organic curve.
  function smoothPath(pts: { x: number; y: number }[]): string {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0]!.x} ${pts[0]!.y}`;
    let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? i : i - 1]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1]!;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return d;
  }

  const linePath = smoothPath(coords);
  // Closed area path for the soft fill underneath.
  const areaPath = `${linePath} L ${coords[coords.length - 1]!.x} ${H - PAD_Y} L ${coords[0]!.x} ${H - PAD_Y} Z`;

  const latest = points[points.length - 1]!;
  const latestCoord = coords[coords.length - 1]!;
  const latestWarm = latest.sentiment >= 5.5;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id="sent-fill-warm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6F7D63" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#6F7D63" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sent-fill-cool" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C8553D" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#C8553D" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Soft baseline at the midpoint (sentiment 5.5) — separates warm/heavy */}
        <line
          x1={PAD_X}
          y1={MIDLINE_Y}
          x2={W - PAD_X}
          y2={MIDLINE_Y}
          stroke="var(--border-hair)"
          strokeDasharray="2 3"
          strokeWidth="0.6"
          opacity="0.7"
        />

        {/* Filled area underneath the curve, gradient color by overall tone */}
        <path
          d={areaPath}
          fill={`url(#${latestWarm ? 'sent-fill-warm' : 'sent-fill-cool'})`}
        />

        {/* The curve itself */}
        <path
          d={linePath}
          fill="none"
          stroke={latestWarm ? '#6F7D63' : '#C8553D'}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dots at each entry */}
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={i === coords.length - 1 ? 3 : 1.8}
            fill={c.s >= 5.5 ? '#6F7D63' : '#C8553D'}
          />
        ))}

        {/* Coral ring around the most recent point */}
        <circle
          cx={latestCoord.x}
          cy={latestCoord.y}
          r={5.5}
          fill="none"
          stroke={latestWarm ? '#6F7D63' : '#C8553D'}
          strokeWidth="0.8"
          opacity="0.4"
        />
      </svg>
      <div
        className="mt-2 flex items-center justify-between"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--ink-tertiary)',
        }}
      >
        <span>oldest</span>
        <span style={{ color: 'var(--ink-secondary)' }}>
          latest: {latest.sentiment}/10
        </span>
        <span>now</span>
      </div>
    </div>
  );
}

/**
 * Single pattern chip. Renders a detected statistical pattern as a soft
 * uppercase mono pill. Coloring is muted — patterns are observations,
 * not actions. Click does nothing (intentional — the chip is the surface).
 */
function PatternChip({ pattern }: { pattern: DetectedPattern }) {
  // Label per pattern kind, short enough to fit on a chip.
  const labelFor = (p: DetectedPattern): string => {
    switch (p.kind) {
      case 'weekday_warmer':
        return 'weekday warmer';
      case 'weekend_warmer':
        return 'weekend warmer';
      case 'time_of_day_warmer':
        return p.fact.startsWith('morning')
          ? 'morning warmer'
          : 'evening warmer';
      case 'tag_dominant': {
        const m = p.fact.match(/"([^"]+)"/);
        return m ? `tag · ${m[1]}` : 'recurring tag';
      }
      case 'sentiment_trending':
        return p.delta && p.delta > 0
          ? 'trending warmer'
          : 'trending heavier';
      case 'gap_unusual':
        return 'unusual gap';
      case 'recurring_context':
        return 'recurring context';
    }
  };
  return (
    <span
      title={pattern.fact}
      className="uppercase"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.12em',
        color: 'var(--ink-secondary)',
        padding: '4px 10px',
        borderRadius: 999,
        border: '0.5px solid var(--border-hair)',
        background: 'rgba(140, 126, 92, 0.06)',
      }}
    >
      {labelFor(pattern)}
    </span>
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
