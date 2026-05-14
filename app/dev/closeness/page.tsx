'use client';

/**
 * Closeness algorithm stress test.
 *
 * Runs ~50 synthetic scenarios + ~15 invariant assertions against the
 * production closeness algorithm. Renders a color-coded table so you can
 * eyeball whether the scoring matches intuition.
 *
 * Dev-only. Navigate to /dev/closeness in any browser.
 */

import { useMemo } from 'react';
import {
  baseClosenessFor,
  closenessFor,
  severityPenaltyFor,
} from '@/lib/closeness';
import type { Entry } from '@/types';

const DAY_MS = 86_400_000;

// ── Entry builders ─────────────────────────────────────────────────────────

let _idCounter = 0;
function entry(opts: {
  sentiment: number;
  daysAgo?: number;
  severity?: 0 | 1 | 2 | 3;
  tags?: string[];
}): Entry {
  _idCounter += 1;
  return {
    id: `synthetic-${_idCounter}`,
    createdAt: Date.now() - (opts.daysAgo ?? 0) * DAY_MS,
    updatedAt: Date.now(),
    text: '',
    personId: 'test',
    sentiment: opts.sentiment,
    tags: opts.tags ?? [],
    aiConfidence: 0.9,
    userConfirmed: false,
    additionalPeople: [],
    severity: opts.severity ?? 0,
  };
}

function spread(
  count: number,
  sentiment: number,
  daysAgoMax = 30,
  opts: { severity?: 0 | 1 | 2 | 3; tags?: string[] } = {}
): Entry[] {
  return Array.from({ length: count }, (_, i) =>
    entry({
      sentiment,
      daysAgo: count > 1 ? (i / (count - 1)) * daysAgoMax : 0,
      severity: opts.severity ?? 0,
      tags: opts.tags ?? [],
    })
  );
}

// ── Scenarios ──────────────────────────────────────────────────────────────

interface Scenario {
  group: string;
  name: string;
  build: () => Entry[];
  /** Expected display range [lo, hi]. Width should be tight enough to mean something. */
  expected: [number, number];
  /** One-line note explaining what behavior this proves. */
  note: string;
}

const SCENARIOS: Scenario[] = [
  // ── Pure positive ────────────────────────────────────────────────────────
  {
    group: 'Pure positive',
    name: '1 sentiment-10 entry today',
    build: () => [entry({ sentiment: 10 })],
    expected: [1.0, 3.5],
    note: 'single entry; freq is tiny so score is modest even with max sentiment',
  },
  {
    group: 'Pure positive',
    name: '3 sentiment-9 entries this week',
    build: () => spread(3, 9, 7),
    expected: [3.0, 5.5],
    note: 'just past forming; positive intensity + small freq',
  },
  {
    group: 'Pure positive',
    name: '10 sentiment-9 entries this month',
    build: () => spread(10, 9, 30),
    expected: [5.5, 8.0],
    note: 'solid frequency + positive valence',
  },
  {
    group: 'Pure positive',
    name: '30 sentiment-9 entries over 90d',
    build: () => spread(30, 9, 90),
    expected: [7.5, 10],
    note: 'high frequency + positive — should be near top',
  },
  {
    group: 'Pure positive',
    name: '50 sentiment-9 entries over 90d',
    build: () => spread(50, 9, 90),
    expected: [8.0, 10],
    note: 'saturation territory',
  },
  {
    group: 'Pure positive',
    name: '10 sentiment-7 (warm but not glowing)',
    build: () => spread(10, 7, 30),
    expected: [4.5, 7.0],
    note: 'positive but moderate; should still beat neutral',
  },

  // ── Pure negative ────────────────────────────────────────────────────────
  {
    group: 'Pure negative',
    name: '1 sentiment-1 entry today',
    build: () => [entry({ sentiment: 1 })],
    expected: [0, 1.0],
    note: 'should be NEAR ZERO — asymmetric intensity means no base bump',
  },
  {
    group: 'Pure negative',
    name: '10 sentiment-2 entries this month',
    build: () => spread(10, 2, 30),
    expected: [0.5, 2.5],
    note: 'frequency adds a little; perturbation pulls down. Mom-test scenario.',
  },
  {
    group: 'Pure negative',
    name: '30 sentiment-2 entries over 90d',
    build: () => spread(30, 2, 90),
    expected: [1.0, 3.5],
    note: 'high freq counts toward base, but no positive intensity',
  },
  {
    group: 'Pure negative',
    name: '5 sentiment-3 entries last 2 weeks',
    build: () => spread(5, 3, 14),
    expected: [0.5, 2.5],
    note: 'recent + negative; perturbation hits',
  },

  // ── Pure neutral ─────────────────────────────────────────────────────────
  {
    group: 'Neutral',
    name: '10 sentiment-5 entries this month',
    build: () => spread(10, 5, 30),
    expected: [1.5, 4.5],
    note: 'neutral never feeds positive intensity; base = freq only',
  },
  {
    group: 'Neutral',
    name: '30 sentiment-5 entries over 90d',
    build: () => spread(30, 5, 90),
    expected: [2.5, 5.5],
    note: 'frequency alone (no positive sentiment, no severity)',
  },

  // ── Mixed valence ────────────────────────────────────────────────────────
  {
    group: 'Mixed',
    name: '10 positive + 10 negative spread',
    build: () => [...spread(10, 9, 30), ...spread(10, 2, 30)],
    expected: [3.0, 6.5],
    note: 'average sentiment cancels; positives still add base intensity',
  },
  {
    group: 'Mixed',
    name: '9 positive + 1 recent negative',
    build: () => [...spread(9, 9, 14), entry({ sentiment: 2, daysAgo: 1 })],
    expected: [4.0, 7.5],
    note: 'modest dip from scenario "10 positives this month"',
  },
  {
    group: 'Mixed',
    name: '18 positive + 2 negative',
    build: () => [...spread(18, 9, 60), ...spread(2, 2, 14)],
    expected: [6.0, 9.0],
    note: 'overwhelmingly positive should stay high',
  },
  {
    group: 'Mixed',
    name: '2 positive + 18 negative',
    build: () => [...spread(2, 9, 60), ...spread(18, 2, 60)],
    expected: [1.5, 4.5],
    note: 'mostly negative; some positive intensity counts',
  },

  // ── Trend trajectories ───────────────────────────────────────────────────
  {
    group: 'Trend',
    name: 'Linear trend UP (3→9 over 60d)',
    build: () => {
      const N = 15;
      return Array.from({ length: N }, (_, i) =>
        entry({
          sentiment: Math.round(3 + (i / (N - 1)) * 6),
          daysAgo: 60 - (i / (N - 1)) * 60,
        })
      );
    },
    expected: [4.5, 7.5],
    note: 'recent entries are positive (and decay favored)',
  },
  {
    group: 'Trend',
    name: 'Linear trend DOWN (9→3 over 60d)',
    build: () => {
      const N = 15;
      return Array.from({ length: N }, (_, i) =>
        entry({
          sentiment: Math.round(9 - (i / (N - 1)) * 6),
          daysAgo: 60 - (i / (N - 1)) * 60,
        })
      );
    },
    expected: [1.5, 5.0],
    note: 'recent entries are negative; perturbation pulls down',
  },
  {
    group: 'Trend',
    name: 'V-curve (good, bad, good again)',
    build: () => [
      ...spread(5, 9, 90),
      ...spread(5, 3, 45),
      ...spread(5, 9, 14),
    ],
    expected: [4.0, 7.5],
    note: 'recent positives recover; recency weighting favors current good',
  },

  // ── Severity ─────────────────────────────────────────────────────────────
  {
    group: 'Severity',
    name: '10 positive + 1 sev-1 mild conflict (7d ago)',
    build: () => [
      ...spread(10, 9, 30),
      entry({ sentiment: 4, daysAgo: 7, severity: 1 }),
    ],
    expected: [5.0, 7.8],
    note: 'severity 1 is a small ding',
  },
  {
    group: 'Severity',
    name: '10 positive + 1 sev-2 betrayal (7d ago)',
    build: () => [
      ...spread(10, 9, 30),
      entry({ sentiment: 2, daysAgo: 7, severity: 2 }),
    ],
    expected: [3.5, 6.5],
    note: 'severity 2 squared = 4× the sev-1 penalty',
  },
  {
    group: 'Severity',
    name: '10 positive + 1 sev-3 violence RECENT (7d ago)',
    build: () => [
      ...spread(10, 9, 30),
      entry({ sentiment: 1, daysAgo: 7, severity: 3 }),
    ],
    expected: [0, 3.0],
    note: 'recent severe → HARD CEILING of 3.0',
  },
  {
    group: 'Severity',
    name: '10 positive + 1 sev-3 violence 40 DAYS ago',
    build: () => [
      ...spread(10, 9, 80),
      entry({ sentiment: 1, daysAgo: 40, severity: 3 }),
    ],
    expected: [2.5, 6.0],
    note: 'past 30-day window: no ceiling; penalty still hits (decayed)',
  },
  {
    group: 'Severity',
    name: '10 positive + 1 sev-3 violence 90 DAYS ago',
    build: () => [
      ...spread(10, 9, 120),
      entry({ sentiment: 1, daysAgo: 90, severity: 3 }),
    ],
    expected: [3.5, 7.5],
    note: 'severity penalty heavily decayed; recovering relationship',
  },
  {
    group: 'Severity',
    name: '30 positives followed by 1 sev-3 today',
    build: () => [
      ...spread(30, 9, 180),
      entry({ sentiment: 1, daysAgo: 0, severity: 3 }),
    ],
    expected: [0, 3.0],
    note: 'doesn\'t matter how good the past was — recent sev-3 caps to 3',
  },
  {
    group: 'Severity',
    name: '3 sev-2 events recent + 5 positives',
    build: () => [
      ...spread(5, 9, 30),
      entry({ sentiment: 2, daysAgo: 3, severity: 2 }),
      entry({ sentiment: 2, daysAgo: 10, severity: 2 }),
      entry({ sentiment: 2, daysAgo: 20, severity: 2 }),
    ],
    expected: [0, 4.5],
    note: 'repeated harm stacks (capped at -4)',
  },
  {
    group: 'Severity',
    name: '2 sev-3 events recent (very bad)',
    build: () => [
      ...spread(5, 9, 30),
      entry({ sentiment: 1, daysAgo: 5, severity: 3 }),
      entry({ sentiment: 1, daysAgo: 15, severity: 3 }),
    ],
    expected: [0, 3.0],
    note: 'severe ceiling + accumulated penalty',
  },

  // ── Frequency dominance ─────────────────────────────────────────────────
  {
    group: 'Frequency',
    name: '5 sentiment-9 entries (rare warm)',
    build: () => spread(5, 9, 60),
    expected: [3.0, 6.0],
    note: 'baseline for comparison',
  },
  {
    group: 'Frequency',
    name: '20 sentiment-7 entries (often warm)',
    build: () => spread(20, 7, 60),
    expected: [5.5, 8.5],
    note: 'should beat the 5-strong scenario (frequency dominance)',
  },
  {
    group: 'Frequency',
    name: '50 sentiment-7 entries (very frequent warm)',
    build: () => spread(50, 7, 90),
    expected: [7.5, 10],
    note: 'frequency near saturation + steady warmth',
  },

  // ── Recency ──────────────────────────────────────────────────────────────
  {
    group: 'Recency',
    name: '10 sentiment-9 all 6 months ago',
    build: () => spread(10, 9, 5, {}).map((e) => ({
      ...e,
      createdAt: e.createdAt - 180 * DAY_MS,
    })),
    expected: [0.5, 4.0],
    note: 'recency-decayed: old positives fade, recent-window count is 0',
  },
  {
    group: 'Recency',
    name: '10 sentiment-9 today + 10 six months ago',
    build: () => [
      ...spread(10, 9, 7),
      ...spread(10, 9, 5).map((e) => ({
        ...e,
        createdAt: e.createdAt - 180 * DAY_MS,
      })),
    ],
    expected: [5.5, 8.0],
    note: 'recent block dominates',
  },

  // ── Depth tags ───────────────────────────────────────────────────────────
  {
    group: 'Depth',
    name: '10 sentiment-7 with vulnerable tag throughout',
    build: () => spread(10, 7, 30, { tags: ['vulnerable'] }),
    expected: [5.0, 8.0],
    note: 'depth boost on top of warmth',
  },
  {
    group: 'Depth',
    name: '10 sentiment-7 with no tags',
    build: () => spread(10, 7, 30, { tags: [] }),
    expected: [4.0, 7.0],
    note: 'baseline for the depth comparison',
  },

  // ── Forming state edge cases ─────────────────────────────────────────────
  {
    group: 'Forming',
    name: '0 entries',
    build: () => [],
    expected: [0, 0],
    note: 'no data → 0',
  },
  {
    group: 'Forming',
    name: '1 entry sentiment-10',
    build: () => [entry({ sentiment: 10 })],
    expected: [1.0, 3.5],
    note: 'algorithm computes; profile UI hides as "forming"',
  },
  {
    group: 'Forming',
    name: '2 entries sentiment-9',
    build: () => spread(2, 9, 3),
    expected: [2.0, 4.5],
    note: 'still forming in UI; algorithm produces a number',
  },

  // ── Real-world archetypes ───────────────────────────────────────────────
  {
    group: 'Archetype',
    name: 'Daily lunch buddy (30 entries × sentiment 8 over 30d)',
    build: () => spread(30, 8, 30),
    expected: [7.0, 9.5],
    note: 'should rank very high',
  },
  {
    group: 'Archetype',
    name: 'Distant relative (3 entries × sentiment 8 over 6mo)',
    build: () => spread(3, 8, 180),
    expected: [1.0, 4.0],
    note: 'sparse + old; low frequency wins out',
  },
  {
    group: 'Archetype',
    name: 'New crush (5 entries × sentiment 10 in last week)',
    build: () => spread(5, 10, 7),
    expected: [4.0, 7.0],
    note: 'small sample, high sentiment, fully recent',
  },
  {
    group: 'Archetype',
    name: 'Reconciled betrayal (sev-3 90d ago + 25 positives after)',
    build: () => [
      entry({ sentiment: 1, daysAgo: 90, severity: 3 }),
      ...spread(25, 9, 75),
    ],
    expected: [4.0, 8.0],
    note: 'past harm decayed; positives drive base back up',
  },
  {
    group: 'Archetype',
    name: 'Toxic ex (20 entries × sentiment 3-5)',
    build: () => spread(20, 4, 60),
    expected: [0.5, 4.0],
    note: 'frequent but no positive intensity',
  },
  {
    group: 'Archetype',
    name: 'Reconnected friend (5 ancient + 10 recent positive)',
    build: () => [
      ...spread(5, 7, 5).map((e) => ({
        ...e,
        createdAt: e.createdAt - 365 * DAY_MS,
      })),
      ...spread(10, 9, 30),
    ],
    expected: [5.0, 8.0],
    note: 'recent activity dominates; old stuff decays',
  },

  // ── Mom-test specifically ────────────────────────────────────────────────
  {
    group: 'Mom-test',
    name: '5 entries "Mom hates me" sentiment 2',
    build: () => spread(5, 2, 14),
    expected: [0, 2.5],
    note: 'previous symmetric bug would have RAISED score; should now be LOW',
  },
  {
    group: 'Mom-test',
    name: '5 entries "Mom gave me a cookie" sentiment 8',
    build: () => spread(5, 8, 14),
    expected: [4.0, 7.0],
    note: 'cookie scenario — should be MEANINGFULLY HIGHER than hate scenario',
  },
];

// ── Invariants (pairwise / monotonicity) ───────────────────────────────────

interface Invariant {
  name: string;
  pass: () => boolean;
  description: string;
}

const INVARIANTS: Invariant[] = [
  {
    name: 'Cookie > hate',
    description: '5 positives must score higher than 5 negatives',
    pass: () => {
      const cookies = closenessFor(spread(5, 8, 14)).display;
      const hate = closenessFor(spread(5, 2, 14)).display;
      return cookies > hate;
    },
  },
  {
    name: 'Adding a positive entry never drops base',
    description: 'baseClosenessFor monotone in positive additions',
    pass: () => {
      const before = baseClosenessFor(spread(10, 7, 30));
      const after = baseClosenessFor([
        ...spread(10, 7, 30),
        entry({ sentiment: 9, daysAgo: 0 }),
      ]);
      return after >= before - 0.001;
    },
  },
  {
    name: 'Adding a severity-3 drops display',
    description: 'severe event must reduce displayed score',
    pass: () => {
      const before = closenessFor(spread(10, 9, 30)).display;
      const after = closenessFor([
        ...spread(10, 9, 30),
        entry({ sentiment: 1, daysAgo: 5, severity: 3 }),
      ]).display;
      return after < before;
    },
  },
  {
    name: 'Recent sev-3 ceiling enforced',
    description: 'any sev-3 within 30 days caps display at 3.0',
    pass: () => {
      const e = [
        ...spread(30, 9, 90),
        entry({ sentiment: 1, daysAgo: 10, severity: 3 }),
      ];
      return closenessFor(e).display <= 3.001;
    },
  },
  {
    name: 'Frequency beats sparse intensity',
    description: '20 sentiment-7 entries should score higher than 5 sentiment-9 entries',
    pass: () => {
      const many = closenessFor(spread(20, 7, 60)).display;
      const few = closenessFor(spread(5, 9, 60)).display;
      return many > few;
    },
  },
  {
    name: 'Recent positives > old positives',
    description: '10 entries today should outscore the same 10 entries 6mo ago',
    pass: () => {
      const recent = closenessFor(spread(10, 9, 7)).display;
      const old = closenessFor(
        spread(10, 9, 5).map((e) => ({
          ...e,
          createdAt: e.createdAt - 180 * DAY_MS,
        }))
      ).display;
      return recent > old;
    },
  },
  {
    name: 'Severity squared',
    description: 'sev-3 penalty should be ~9× the sev-1 penalty (same recency)',
    pass: () => {
      const sev1 = severityPenaltyFor([
        entry({ sentiment: 1, daysAgo: 0, severity: 1 }),
      ]);
      const sev3 = severityPenaltyFor([
        entry({ sentiment: 1, daysAgo: 0, severity: 3 }),
      ]);
      // sev1 returns -0.4, sev3 returns -3.6 → ratio = 9.0 exactly
      return Math.abs(sev3 / sev1 - 9.0) < 0.01;
    },
  },
  {
    name: 'Negative entries do NOT raise base intensity',
    description: 'adding a sentiment-2 should not boost base over the positive scenario',
    pass: () => {
      const positive = baseClosenessFor(spread(10, 9, 30));
      const withNeg = baseClosenessFor([
        ...spread(10, 9, 30),
        entry({ sentiment: 2, daysAgo: 1 }),
      ]);
      // frequency bumps it slightly; the test is that intensity didn't help
      return withNeg <= positive + 0.5;
    },
  },
  {
    name: 'Empty entries → 0',
    description: 'no entries should produce score 0',
    pass: () => closenessFor([]).display === 0,
  },
  {
    name: 'Severity penalty cap holds',
    description: 'piling on severe events doesn\'t drag penalty below -4',
    pass: () => {
      const e = Array.from({ length: 20 }, (_, i) =>
        entry({ sentiment: 1, daysAgo: i, severity: 3 })
      );
      return severityPenaltyFor(e) >= -4.001;
    },
  },
  {
    name: 'Old sev-3 (90d) softer than recent sev-3 (5d)',
    description: 'decay must reduce severity penalty for older events',
    pass: () => {
      const old = Math.abs(
        severityPenaltyFor([
          entry({ sentiment: 1, daysAgo: 90, severity: 3 }),
        ])
      );
      const recent = Math.abs(
        severityPenaltyFor([entry({ sentiment: 1, daysAgo: 5, severity: 3 })])
      );
      return recent > old;
    },
  },
  {
    name: 'Display clamped 0–10',
    description: 'no combination should produce display < 0 or > 10',
    pass: () => {
      const a = closenessFor(spread(50, 10, 30)).display;
      const b = closenessFor([
        ...spread(50, 1, 30),
        entry({ sentiment: 1, daysAgo: 5, severity: 3 }),
      ]).display;
      return a <= 10 && a >= 0 && b <= 10 && b >= 0;
    },
  },
  {
    name: 'Severity-0 has zero penalty',
    description: 'entries without severity must not contribute to severityPenalty',
    pass: () => {
      const p = severityPenaltyFor(spread(20, 5, 60));
      return p === 0;
    },
  },
  {
    name: 'Same entries → same score',
    description: 'closeness is deterministic for identical inputs',
    pass: () => {
      const a = closenessFor(spread(15, 7, 30));
      const b = closenessFor(spread(15, 7, 30));
      return Math.abs(a.display - b.display) < 0.001;
    },
  },
];

// ── Page ───────────────────────────────────────────────────────────────────

export default function ClosenessStressTest() {
  const results = useMemo(() => {
    return SCENARIOS.map((s) => {
      const entries = s.build();
      const c = closenessFor(entries);
      const pass =
        c.display >= s.expected[0] - 0.001 &&
        c.display <= s.expected[1] + 0.001;
      return { ...s, c, pass, n: entries.length };
    });
  }, []);

  const invariants = useMemo(
    () =>
      INVARIANTS.map((inv) => {
        let pass = false;
        let error: string | null = null;
        try {
          pass = inv.pass();
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        }
        return { ...inv, pass, error };
      }),
    []
  );

  const scenarioPassCount = results.filter((r) => r.pass).length;
  const invariantPassCount = invariants.filter((i) => i.pass).length;

  return (
    <main
      style={{
        padding: '20px 16px',
        fontFamily: 'var(--font-fraunces)',
        background: 'var(--bg-cream)',
        minHeight: '100vh',
        overflow: 'auto',
        height: 'auto',
        color: 'var(--ink-primary)',
      }}
    >
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1
          style={{
            fontSize: 28,
            fontStyle: 'italic',
            fontWeight: 500,
            margin: 0,
          }}
        >
          closeness algorithm stress test
        </h1>
        <p
          style={{
            marginTop: 4,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--ink-secondary)',
          }}
        >
          {scenarioPassCount} / {results.length} scenarios in expected range ·{' '}
          {invariantPassCount} / {invariants.length} invariants hold
        </p>

        {/* Scenarios */}
        <h2
          style={{
            marginTop: 32,
            fontSize: 18,
            fontStyle: 'italic',
            fontWeight: 500,
          }}
        >
          scenarios
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--ink-secondary)',
          }}
        >
          rows are coloured by whether the actual display score falls inside
          the expected range. expected ranges are loose by design — exact
          numbers depend on the weights, only the ordering and the qualitative
          shape need to make sense.
        </p>

        <ScenarioTable results={results} />

        {/* Invariants */}
        <h2
          style={{
            marginTop: 40,
            fontSize: 18,
            fontStyle: 'italic',
            fontWeight: 500,
          }}
        >
          invariants
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--ink-secondary)',
          }}
        >
          rules that must always hold. any failure here is a bug, regardless of
          tuning.
        </p>

        <InvariantList invariants={invariants} />
      </div>
    </main>
  );
}

function ScenarioTable({
  results,
}: {
  results: Array<{
    group: string;
    name: string;
    expected: [number, number];
    note: string;
    n: number;
    pass: boolean;
    c: ReturnType<typeof closenessFor>;
  }>;
}) {
  // Group rows by group label so the table reads in sections.
  const groups: Record<string, typeof results> = {};
  for (const r of results) {
    if (!groups[r.group]) groups[r.group] = [];
    groups[r.group]!.push(r);
  }

  return (
    <div style={{ marginTop: 12 }}>
      {Object.entries(groups).map(([group, rows]) => (
        <div key={group} style={{ marginTop: 20 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ink-secondary)',
              marginBottom: 6,
            }}
          >
            {group}
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: 'left',
                  borderBottom: '0.5px solid var(--border-hair)',
                  color: 'var(--ink-tertiary)',
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                <th style={{ padding: '6px 4px' }}>scenario</th>
                <th style={{ padding: '6px 4px', width: 60 }}>n</th>
                <th style={{ padding: '6px 4px', width: 100 }}>expected</th>
                <th style={{ padding: '6px 4px', width: 60 }}>display</th>
                <th style={{ padding: '6px 4px', width: 160 }}>breakdown</th>
                <th style={{ padding: '6px 4px', width: 50 }}>ok?</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const bg = r.pass
                  ? 'transparent'
                  : 'rgba(200, 85, 61, 0.06)';
                return (
                  <tr
                    key={i}
                    style={{
                      borderBottom: '0.5px solid var(--border-hair)',
                      background: bg,
                    }}
                  >
                    <td style={{ padding: '8px 4px' }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-fraunces)',
                          fontStyle: 'italic',
                          fontSize: 13,
                          color: 'var(--ink-primary)',
                        }}
                      >
                        {r.name}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-fraunces)',
                          fontStyle: 'italic',
                          fontSize: 11,
                          color: 'var(--ink-tertiary)',
                          marginTop: 2,
                        }}
                      >
                        {r.note}
                      </div>
                    </td>
                    <td style={{ padding: '8px 4px' }}>{r.n}</td>
                    <td style={{ padding: '8px 4px' }}>
                      {r.expected[0].toFixed(1)} – {r.expected[1].toFixed(1)}
                    </td>
                    <td style={{ padding: '8px 4px', fontWeight: 500 }}>
                      {r.c.display.toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: '8px 4px',
                        color: 'var(--ink-secondary)',
                        fontSize: 10,
                      }}
                    >
                      b{r.c.base.toFixed(1)} p{r.c.perturbation.toFixed(2)} s
                      {r.c.severityPenalty.toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: '8px 4px',
                        color: r.pass
                          ? 'var(--accent-sage)'
                          : 'var(--accent-coral)',
                        fontWeight: 500,
                      }}
                    >
                      {r.pass ? '✓' : '✗'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function InvariantList({
  invariants,
}: {
  invariants: Array<{
    name: string;
    description: string;
    pass: boolean;
    error: string | null;
  }>;
}) {
  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: '12px 0 0 0',
      }}
    >
      {invariants.map((inv, i) => (
        <li
          key={i}
          style={{
            padding: '10px 0',
            borderBottom: '0.5px solid var(--border-hair)',
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              fontWeight: 500,
              color: inv.pass ? 'var(--accent-sage)' : 'var(--accent-coral)',
              minWidth: 16,
            }}
          >
            {inv.pass ? '✓' : '✗'}
          </span>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontStyle: 'italic',
                fontSize: 14,
                color: 'var(--ink-primary)',
              }}
            >
              {inv.name}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--ink-secondary)',
                marginTop: 2,
              }}
            >
              {inv.description}
              {inv.error && (
                <span style={{ color: 'var(--accent-coral)' }}>
                  {' '}
                  · error: {inv.error}
                </span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
