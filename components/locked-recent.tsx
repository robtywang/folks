'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { Person } from '@/types';

function relativeDate(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

export function LockedRecent() {
  const entries = useLiveQuery(
    async () => db.entries.orderBy('createdAt').reverse().limit(10).toArray(),
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

  // Only show entries we can drill into (have a person). Top 3.
  const recent = entries
    .filter((e) => e.personId && peopleById.has(e.personId))
    .slice(0, 3);

  if (recent.length === 0) return null;

  return (
    <div className="mt-12">
      <div className="mb-2 flex items-center gap-3">
        <span
          className="text-[10px] uppercase tracking-widest text-ink-secondary"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          recent
        </span>
        <div className="h-px flex-1" style={{ background: 'var(--border-hair)' }} />
      </div>

      <div>
        {recent.map((entry) => {
          const person = peopleById.get(entry.personId!)!;
          return (
            <Link
              key={entry.id}
              href="/journal"
              className="block py-3.5 transition-opacity hover:opacity-80"
              style={{ borderBottom: '0.5px solid var(--border-hair)' }}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className="text-[15px] text-ink-primary"
                  style={{ fontFamily: 'var(--font-fraunces)' }}
                >
                  {person.name}
                </span>
                <span
                  className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-ink-tertiary"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  <i className="ti ti-lock" style={{ fontSize: 11 }} aria-hidden="true" />
                  {relativeDate(entry.createdAt)}
                </span>
              </div>

              {/* Redacted preview — the entry text is never rendered here.
                  Two pill bars suggest the shape of a logged thought. */}
              <div className="mt-2 space-y-1.5" aria-label="entry hidden">
                <div
                  className="h-2 w-[88%] rounded-full"
                  style={{ background: 'var(--border-hair)' }}
                />
                <div
                  className="h-2 w-[62%] rounded-full"
                  style={{ background: 'var(--border-hair)' }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
