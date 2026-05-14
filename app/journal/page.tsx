'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  updateEntryText,
  deleteEntry,
  updateEntryAttribution,
} from '@/lib/save-entry';
import { seedTestData } from '@/lib/seed';
import { hasLockPin, isUnlocked } from '@/lib/lock';
import { LockScreen } from '@/components/lock-screen';
import type { Entry, Person } from '@/types';

function shortTime(timestamp: number): string {
  return new Date(timestamp)
    .toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
    .toLowerCase();
}

/**
 * Key entries by calendar day (local time). Used to group the journal feed.
 */
function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Render a date header.
 *   Today           → "Today · May 13"
 *   Yesterday       → "Yesterday · May 12"
 *   2–14 days back  → "Monday · May 11"
 *   Older           → "May 1"
 */
function formatDateHeader(timestamp: number): string {
  const date = new Date(timestamp);
  const startOf = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c.getTime();
  };

  const entryDay = startOf(date);
  const today = startOf(new Date());
  const daysAgo = Math.round((today - entryDay) / (24 * 60 * 60 * 1000));
  const monthDay = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });

  if (daysAgo === 0) return `Today · ${monthDay}`;
  if (daysAgo === 1) return `Yesterday · ${monthDay}`;
  if (daysAgo >= 2 && daysAgo <= 14) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    return `${dayName} · ${monthDay}`;
  }
  return monthDay;
}

interface DayGroup {
  key: string;
  date: number; // timestamp of the most recent entry that day
  entries: Entry[];
}

function groupByDay(entries: Entry[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const e of entries) {
    const key = dayKey(e.createdAt);
    const existing = map.get(key);
    if (existing) {
      existing.entries.push(e);
      if (e.createdAt > existing.date) existing.date = e.createdAt;
    } else {
      map.set(key, { key, date: e.createdAt, entries: [e] });
    }
  }
  // Most recent day first.
  return Array.from(map.values()).sort((a, b) => b.date - a.date);
}

export default function JournalPage() {
  // Lock gate
  const [unlocked, setLocalUnlocked] = useState(false);
  const [gateChecked, setGateChecked] = useState(false);

  useEffect(() => {
    if (hasLockPin() && !isUnlocked()) {
      setLocalUnlocked(false);
    } else {
      setLocalUnlocked(true);
    }
    setGateChecked(true);
  }, []);

  if (!gateChecked) {
    return <main className="mx-auto h-[100svh] w-full max-w-md overflow-y-auto" />;
  }

  if (!unlocked) {
    return (
      <LockScreen
        title="journal is locked"
        onUnlock={() => setLocalUnlocked(true)}
      />
    );
  }

  return <JournalContent />;
}

function JournalContent() {
  const [seeding, setSeeding] = useState(false);
  const [query, setQuery] = useState('');

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedTestData();
    } finally {
      setSeeding(false);
    }
  }

  const entries = useLiveQuery(
    async () => db.entries.orderBy('createdAt').reverse().toArray(),
    [],
    []
  );

  const peopleById = useLiveQuery(
    async () => {
      const arr = await db.people.toArray();
      return new Map(arr.map((p) => [p.id, p]));
    },
    [],
    new Map<string, Person>()
  );

  const allPeople = useLiveQuery(
    async () => {
      const arr = await db.people.filter((p) => !p.muted).toArray();
      return arr.sort((a, b) => b.closenessScore - a.closenessScore);
    },
    [],
    []
  );

  // Search: case-insensitive substring on entry text OR attributed person name.
  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      if (e.text.toLowerCase().includes(q)) return true;
      const person = e.personId ? peopleById.get(e.personId) : null;
      if (person && person.name.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [entries, peopleById, query]);

  // Pull-up-to-reveal pattern: search bar sits at the very top of the scroll
  // content, hidden by setting scrollTop past it on mount. Scrolling up at
  // the top of the list brings it back into view (Apple Mail-style).
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollRef.current || entries.length === 0) return;
    // Defer to next frame so layout has settled before we measure/scroll.
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        // 44 ≈ search row height (py-2 + 13px input + 0.5px border). Tuned
        // visually rather than measured to avoid layout thrash.
        scrollRef.current.scrollTop = 44;
      }
    });
  }, [entries.length]);

  return (
    <main className="mx-auto flex h-[100svh] w-full max-w-md flex-col overflow-hidden px-4 pt-6">
      <header className="flex flex-shrink-0 items-center justify-between">
        <Link
          href="/"
          aria-label="Back"
          className="text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
        </Link>
        <span
          className="text-[15px] italic text-ink-primary"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          journal
        </span>
        <span aria-hidden="true" style={{ width: 18 }} />
      </header>

      <div ref={scrollRef} className="-mx-4 flex-1 overflow-y-auto px-4 pb-12">
        {/* Search line — lives at the top of the scroll surface, hidden by
            an initial scrollTop offset. Pull up at the top of the list to
            reveal. */}
        {entries.length > 0 && (
          <div
            className="relative flex items-center"
            style={{ borderBottom: '0.5px solid var(--border-hair)' }}
          >
            <i
              className="ti ti-search pointer-events-none flex-shrink-0 text-ink-tertiary"
              style={{ fontSize: 13 }}
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search entries"
              className="ml-2 flex-1 bg-transparent py-2 text-[13px] italic text-ink-primary placeholder:text-ink-tertiary focus:outline-none"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="ml-2 flex-shrink-0 text-ink-tertiary transition-colors hover:text-ink-primary"
              >
                <i className="ti ti-x" style={{ fontSize: 13 }} />
              </button>
            )}
          </div>
        )}

        <div className="mt-8">
        <div className="mb-2 flex items-center gap-3">
          <span
            className="text-[10px] uppercase tracking-widest text-ink-secondary"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {query.trim()
              ? `${filteredEntries.length} ${filteredEntries.length === 1 ? 'match' : 'matches'}`
              : 'all entries'}
          </span>
          <div className="h-px flex-1" style={{ background: 'var(--border-hair)' }} />
        </div>

        {entries.length === 0 ? (
          <div className="py-12 text-center">
            <div
              className="text-[13px] italic text-ink-tertiary"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              no entries yet
            </div>
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="mt-5 text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-50"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {seeding ? 'loading…' : 'load test data →'}
            </button>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="py-12 text-center">
            <p
              className="text-[13px] italic text-ink-tertiary"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              no entries match "{query.trim()}"
            </p>
          </div>
        ) : (
          groupByDay(filteredEntries).map((group) => (
            <div key={group.key} className="mt-8 first:mt-0">
              {/* Date header */}
              <h2
                className="text-[18px] italic leading-tight text-ink-primary"
                style={{ fontFamily: 'var(--font-fraunces)' }}
              >
                {formatDateHeader(group.date)}
              </h2>
              <div
                className="mt-1 mb-1 h-px"
                style={{ background: 'var(--border-hair)' }}
              />
              {group.entries.map((entry) => (
                <JournalRow
                  key={entry.id}
                  entry={entry}
                  person={
                    entry.personId ? peopleById.get(entry.personId) : undefined
                  }
                  allPeople={allPeople}
                  query={query}
                />
              ))}
            </div>
          ))
        )}
        </div>
      </div>
    </main>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const out: React.ReactNode[] = [];
  let last = 0;
  let idx = lower.indexOf(qLower);
  let key = 0;
  while (idx !== -1) {
    if (idx > last) out.push(text.slice(last, idx));
    out.push(
      <span key={key++} className="folks-name-highlight">
        {text.slice(idx, idx + q.length)}
      </span>
    );
    last = idx + q.length;
    idx = lower.indexOf(qLower, last);
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function JournalRow({
  entry,
  person,
  allPeople,
  query,
}: {
  entry: Entry;
  person: Person | undefined;
  allPeople: Person[];
  query: string;
}) {
  const [mode, setMode] = useState<'rest' | 'edit' | 'confirm-delete'>('rest');
  const [draft, setDraft] = useState(entry.text);
  const [newPersonInput, setNewPersonInput] = useState('');
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setDraft(entry.text);
    setNewPersonInput('');
    setMode('edit');
  }

  function cancelEdit() {
    setMode('rest');
    setDraft(entry.text);
    setNewPersonInput('');
  }

  async function saveText() {
    if (!draft.trim() || draft === entry.text) {
      setMode('rest');
      return;
    }
    setBusy(true);
    try {
      await updateEntryText(entry.id, draft);
      setMode('rest');
    } finally {
      setBusy(false);
    }
  }

  async function reassign(target: { kind: 'person'; name: string } | { kind: 'solo' }) {
    setBusy(true);
    try {
      await updateEntryAttribution(entry.id, target);
    } finally {
      setBusy(false);
    }
  }

  async function addNewPerson() {
    const name = newPersonInput.trim();
    if (!name) return;
    await reassign({ kind: 'person', name });
    setNewPersonInput('');
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteEntry(entry.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="py-3"
      style={{ borderBottom: '0.5px solid var(--border-hair)' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        {person ? (
          <Link
            href={`/person/${person.id}`}
            className="text-[14px] text-ink-primary transition-opacity hover:opacity-70"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            {person.name}
          </Link>
        ) : (
          <span
            className="text-[14px] italic text-ink-secondary"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            solo
          </span>
        )}
        <div className="flex flex-shrink-0 items-center gap-3">
          <span
            className="text-[10px] uppercase tracking-widest"
            style={{
              fontFamily: 'var(--font-mono)',
              color: '#8C7E5C',
            }}
          >
            {shortTime(entry.createdAt)}
          </span>
          {mode === 'rest' && (
            <>
              <button
                onClick={startEdit}
                aria-label="Edit entry"
                className="text-ink-tertiary transition-colors hover:text-ink-primary"
              >
                <i className="ti ti-pencil" style={{ fontSize: 13 }} />
              </button>
              <button
                onClick={() => setMode('confirm-delete')}
                aria-label="Delete entry"
                className="text-ink-tertiary transition-colors hover:text-accent-coral"
              >
                <i className="ti ti-trash" style={{ fontSize: 13 }} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="min-w-0">
        {/* (header is above; this wrapper holds the body / edit form / confirm-delete) */}

        {mode === 'edit' ? (
          <div className="mt-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              disabled={busy}
              className="w-full resize-none rounded-md border bg-white/40 px-3 py-2 text-[13px] italic leading-snug text-ink-primary focus:outline-none"
              style={{
                fontFamily: 'var(--font-fraunces)',
                borderColor: 'var(--border-hair)',
              }}
            />

            <div className="mt-3">
              <div
                className="mb-1.5 text-[10px] uppercase tracking-widest text-ink-secondary"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                attribute to
              </div>
              <input
                value={newPersonInput}
                onChange={(e) => setNewPersonInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addNewPerson();
                  }
                }}
                placeholder="type a name…"
                autoComplete="off"
                className="w-full bg-transparent py-1.5 text-[13px] text-ink-primary placeholder:italic placeholder:text-ink-tertiary focus:outline-none"
                style={{
                  fontFamily: 'var(--font-fraunces)',
                  borderBottom: '0.5px solid var(--border-hair)',
                }}
              />

              {newPersonInput.trim() && (() => {
                const typed = newPersonInput.trim();
                const lower = typed.toLowerCase();
                const matches = allPeople.filter((p) =>
                  p.name.toLowerCase().includes(lower)
                );
                const exact = matches.find(
                  (p) => p.name.toLowerCase() === lower
                );
                return (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {matches.slice(0, 4).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => reassign({ kind: 'person', name: p.name })}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition-opacity hover:opacity-70"
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
                          existing
                        </span>
                      </button>
                    ))}
                    {!exact && (
                      <button
                        onClick={addNewPerson}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition-opacity hover:opacity-70"
                        style={{
                          borderColor: 'var(--border-hair)',
                          fontFamily: 'var(--font-fraunces)',
                        }}
                      >
                        {typed}
                        <span
                          className="text-[9px] uppercase tracking-widest text-ink-tertiary"
                          style={{ fontFamily: 'var(--font-mono)' }}
                        >
                          new
                        </span>
                      </button>
                    )}
                  </div>
                );
              })()}

              {entry.personId !== null && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => reassign({ kind: 'solo' })}
                    disabled={busy}
                    className="text-[11px] uppercase tracking-widest text-ink-secondary transition-colors hover:text-ink-primary"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    mark solo
                  </button>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-end gap-3">
              <button
                onClick={cancelEdit}
                disabled={busy}
                className="text-[11px] uppercase tracking-widest text-ink-secondary"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                cancel
              </button>
              <button
                onClick={saveText}
                disabled={busy || !draft.trim()}
                className="text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-40"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {busy ? 'saving…' : 'save text →'}
              </button>
            </div>
          </div>
        ) : (
          <p
            className="mt-1 text-[13px] italic leading-snug text-ink-secondary"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            "{highlightMatch(entry.text, query)}"
          </p>
        )}

        {mode === 'confirm-delete' && (
          <div
            className="mt-2 flex items-center justify-between gap-3 rounded-md px-3 py-2"
            style={{
              background: 'rgba(200, 85, 61, 0.08)',
              borderLeft: '2px solid var(--accent-coral)',
            }}
          >
            <span
              className="text-[12px] italic text-ink-primary"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              delete this entry?
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMode('rest')}
                disabled={busy}
                className="text-[11px] uppercase tracking-widest text-ink-secondary"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-40"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {busy ? 'deleting…' : 'delete'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

