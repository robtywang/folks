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
import { hasLockPin, isUnlocked } from '@/lib/lock';
import { LockScreen } from '@/components/lock-screen';
import type { Entry, Person } from '@/types';

function shortTime(timestamp: number): string {
  // en-US locale gives "1:38 AM" — upper-case AM/PM directly. CSS uppercases
  // the rest of the string for the metadata-style look.
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Key entries by local calendar day for grouping. */
function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Date header label.
 *   Today    → "Today · May 14"
 *   Yesterday → "Yesterday · May 13"
 *   2–14 days → "Monday · May 12"
 *   Older    → "May 1"
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
  date: number;
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
  return Array.from(map.values()).sort((a, b) => b.date - a.date);
}

/**
 * Pulls the names that should be coral-linked inside this entry's text:
 * primary person (resolved via personId → lookup) + each additionalPeople
 * string that we can match to a known person record. Returns a map of
 * lowercased name → personId, with primary winning on ambiguity.
 */
function resolveNamesToIds(
  entry: Entry,
  peopleById: Map<string, Person>
): Map<string, string> {
  const map = new Map<string, string>();
  if (entry.personId) {
    const p = peopleById.get(entry.personId);
    if (p) map.set(p.name.toLowerCase(), p.id);
  }
  for (const candidate of entry.additionalPeople ?? []) {
    const lower = candidate.toLowerCase();
    if (map.has(lower)) continue; // primary wins
    for (const [, person] of peopleById.entries()) {
      if (person.name.toLowerCase() === lower) {
        map.set(lower, person.id);
        break;
      }
    }
  }
  return map;
}

/** Inline coral link style used for every name match inside entry text. */
const NAME_LINK_STYLE: React.CSSProperties = {
  color: 'var(--accent-coral)',
  fontStyle: 'normal',
  fontWeight: 500,
  textDecoration: 'none',
};

/**
 * Render an entry's body with two layered effects:
 *   1. Known person names → inline tappable Link in coral.
 *   2. Active search query (if any) → faint coral chip from compose. Applied
 *      only inside the non-name segments so we don't double-highlight the
 *      already-coloured name spans.
 */
function renderBody(
  text: string,
  nameMap: Map<string, string>,
  query: string
): React.ReactNode {
  if (nameMap.size === 0) {
    return highlightSearch(text, query);
  }
  const names = [...nameMap.keys()].sort((a, b) => b.length - a.length);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b(${names.map(escape).join('|')})\\b`, 'gi');
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) {
      out.push(
        <span key={`t${key++}`}>
          {highlightSearch(text.slice(last, m.index), query)}
        </span>
      );
    }
    const matched = m[0];
    const id = nameMap.get(matched.toLowerCase());
    if (id) {
      out.push(
        <Link
          key={`n${key++}`}
          href={`/person/${id}`}
          className="folks-name-link"
          style={NAME_LINK_STYLE}
        >
          {matched}
        </Link>
      );
    } else {
      out.push(matched);
    }
    last = m.index + matched.length;
  }
  if (last < text.length) {
    out.push(
      <span key={`t${key++}`}>
        {highlightSearch(text.slice(last), query)}
      </span>
    );
  }
  return out;
}

/** Wrap search-query matches with the faint coral chip styling. */
function highlightSearch(text: string, query: string): React.ReactNode {
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

export default function JournalPage() {
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
  const [query, setQuery] = useState('');

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

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollRef.current || entries.length === 0) return;
    requestAnimationFrame(() => {
      if (scrollRef.current) {
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
          {query.trim() && (
            <div
              className="mb-6 text-[10px] uppercase tracking-widest text-ink-secondary"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {filteredEntries.length}{' '}
              {filteredEntries.length === 1 ? 'match' : 'matches'}
            </div>
          )}

          {entries.length === 0 ? (
            <div className="py-12 text-center">
              <p
                className="text-[13px] italic text-ink-tertiary"
                style={{ fontFamily: 'var(--font-fraunces)' }}
              >
                no entries yet
              </p>
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
            groupByDay(filteredEntries).map((group, dayIdx) => (
              <div
                key={group.key}
                style={{ marginTop: dayIdx === 0 ? 0 : 56 }}
              >
                <h2
                  style={{
                    fontFamily: 'var(--font-fraunces)',
                    fontSize: 30,
                    fontStyle: 'italic',
                    fontWeight: 500,
                    color: 'var(--ink-primary)',
                    lineHeight: 1.15,
                    marginBottom: 24,
                  }}
                >
                  {formatDateHeader(group.date)}
                </h2>

                {/* Strict reverse-chronological list — every entry stands
                    alone, separated by a single hairline. No grouping. */}
                {group.entries.map((entry, eIdx) => (
                  <div
                    key={entry.id}
                    style={{
                      borderTop:
                        eIdx === 0
                          ? 'none'
                          : '1px solid var(--border-hair)',
                      paddingTop: eIdx === 0 ? 0 : 20,
                      paddingBottom: eIdx === group.entries.length - 1 ? 0 : 20,
                    }}
                  >
                    <JournalEntry
                      entry={entry}
                      peopleById={peopleById}
                      allPeople={allPeople}
                      query={query}
                    />
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}

function JournalEntry({
  entry,
  peopleById,
  allPeople,
  query,
}: {
  entry: Entry;
  peopleById: Map<string, Person>;
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
  async function reassign(
    target: { kind: 'person'; name: string } | { kind: 'solo' }
  ) {
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

  const nameMap = useMemo(
    () => resolveNamesToIds(entry, peopleById),
    [entry, peopleById]
  );

  return (
    <div>
      {/* Header row: timestamp left, icons right. No name header anymore —
          the name is highlighted inline inside the body below. */}
      <div className="flex items-baseline justify-between gap-3">
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-secondary)',
          }}
        >
          {shortTime(entry.createdAt)}
        </span>
        {mode === 'rest' && (
          <div
            className="flex flex-shrink-0 items-center gap-3"
            style={{ opacity: 0.4 }}
          >
            <button
              onClick={startEdit}
              aria-label="Edit entry"
              className="text-ink-primary transition-opacity hover:opacity-100"
            >
              <i className="ti ti-pencil" style={{ fontSize: 13 }} />
            </button>
            <button
              onClick={() => setMode('confirm-delete')}
              aria-label="Delete entry"
              className="text-ink-primary transition-opacity hover:opacity-100"
            >
              <i className="ti ti-trash" style={{ fontSize: 13 }} />
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      {mode === 'edit' ? (
        <div className="mt-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            disabled={busy}
            className="w-full resize-none rounded-md border bg-white/40 px-3 py-2 text-[15px] italic leading-snug text-ink-primary focus:outline-none"
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

            {newPersonInput.trim() &&
              (() => {
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
                        onClick={() =>
                          reassign({ kind: 'person', name: p.name })
                        }
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
          style={{
            marginTop: 6,
            fontFamily: 'var(--font-fraunces)',
            fontSize: 14,
            fontStyle: 'italic',
            lineHeight: 1.5,
            color: 'var(--ink-primary)',
          }}
        >
          {renderBody(entry.text, nameMap, query)}
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
  );
}
