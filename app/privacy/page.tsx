import Link from 'next/link';

export const metadata = {
  title: 'folks · privacy',
  description:
    'folks is a journal that stores everything on your device. nothing is sent anywhere except text snippets routed to Anthropic for AI responses.',
};

export default function PrivacyPage() {
  return (
    <main
      className="mx-auto h-[100svh] w-full max-w-md overflow-y-auto px-6 pb-12 pt-8"
      style={{ background: 'var(--bg-cream)', color: 'var(--ink-primary)' }}
    >
      <header className="flex items-center justify-between">
        <Link
          href="/"
          aria-label="Back"
          className="text-ink-secondary transition-colors hover:text-ink-primary"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
        >
          ← back
        </Link>
        <span
          className="uppercase"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.18em',
            color: 'var(--ink-tertiary)',
          }}
        >
          last updated · may 2026
        </span>
      </header>

      <h1
        className="mt-10 italic"
        style={{
          fontFamily: 'var(--font-fraunces)',
          fontSize: 36,
          lineHeight: 1.15,
          color: 'var(--ink-primary)',
        }}
      >
        privacy.
      </h1>
      <p
        className="mt-3 italic"
        style={{
          fontFamily: 'var(--font-fraunces)',
          fontSize: 15,
          lineHeight: 1.5,
          color: 'var(--ink-secondary)',
        }}
      >
        what folks does (and doesn&apos;t do) with what you write.
      </p>

      <Section label="the short version">
        <P>
          folks stores everything on your device. there is no account, no
          cloud, no backup we control, and no analytics. the only data that
          ever leaves your device is the text snippets we send to Anthropic so
          their model can read and reply — and Anthropic doesn&apos;t keep
          those past the request.
        </P>
        <P>
          we don&apos;t collect anything about you. we don&apos;t track you.
          we have no idea who you are.
        </P>
      </Section>

      <Section label="what we do not collect">
        <Bullet>email or phone number</Bullet>
        <Bullet>name, profile, or any identifier</Bullet>
        <Bullet>usage analytics, error telemetry, or crash reports</Bullet>
        <Bullet>device IDs, IP addresses, or location data</Bullet>
        <Bullet>your entries, names, sentiments, or any other journal data</Bullet>
        <P className="mt-3">
          folks has no backend database. there is no server-side record of
          your existence as a user.
        </P>
      </Section>

      <Section label="what stays on your device">
        <P>
          everything you create in folks is stored locally in your
          browser&apos;s IndexedDB and localStorage:
        </P>
        <Bullet>entry text, sentiment, tags, and timestamps</Bullet>
        <Bullet>the people you&apos;ve mentioned (names, relationships, notes)</Bullet>
        <Bullet>folks-generated readings, reflections, and weekly recaps</Bullet>
        <Bullet>
          your optional 4-digit passcode (stored as a PBKDF2-SHA-256 hash with
          a random salt — we cannot recover it for you)
        </Bullet>
        <P className="mt-3">
          clearing your browser data or tapping &quot;delete all&quot; in
          settings wipes everything irreversibly. there is no other copy.
        </P>
      </Section>

      <Section label="what gets sent to anthropic, and why">
        <P>
          folks uses anthropic&apos;s Claude models for three things:
        </P>
        <Bullet>
          reading what you write so it can attribute the entry to a person,
          rate sentiment, and pick tags (Claude Sonnet 4.6)
        </Bullet>
        <Bullet>
          replying to you in the chat surface, drawing on past entries about
          the same person (Claude Sonnet 4.6 or Opus 4.7 depending on context
          size)
        </Bullet>
        <Bullet>
          cleaning up voice transcripts with punctuation and capitalization
          (Claude Haiku 4.5)
        </Bullet>
        <P className="mt-3">
          for each request, only the relevant text (your current message and
          the past entries about the person being discussed) is sent. audio
          itself never leaves your device — speech-to-text runs in your
          browser via the Web Speech API.
        </P>
        <P className="mt-3">
          anthropic&apos;s API defaults to <em>not</em> retaining inputs past
          the request, not training on them, and not surfacing them to humans
          on the normal path. you can read their policy at{' '}
          <a
            href="https://www.anthropic.com/legal/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent-coral)' }}
          >
            anthropic.com/legal/privacy
          </a>
          .
        </P>
      </Section>

      <Section label="voice">
        <P>
          when you tap the mic, your browser&apos;s built-in speech
          recognition converts audio to text. on iOS and modern android,
          this runs on-device. the raw audio is never recorded, saved, or
          uploaded by folks. only the resulting text is treated like any
          other entry (i.e. sent to Anthropic if and when an AI reply is
          generated for it).
        </P>
      </Section>

      <Section label="children">
        <P>
          folks is not intended for users under 13. we do not knowingly
          collect data from anyone — but the kinds of relationship
          processing the app supports are written for adults.
        </P>
      </Section>

      <Section label="your rights">
        <P>
          because folks holds no data about you on its servers, there is
          nothing to request or correct from us. you have full local
          control:
        </P>
        <Bullet>
          export — tap <em>settings → data → download</em> for a JSON file
          of every entry and person on your device
        </Bullet>
        <Bullet>
          delete — tap <em>settings → data → delete all</em> for an
          irreversible wipe (two confirmations)
        </Bullet>
        <Bullet>
          revoke microphone access — your operating system controls voice
          permissions; folks honors them
        </Bullet>
      </Section>

      <Section label="third parties">
        <P>
          we use exactly one third-party service: <strong>Anthropic</strong>,
          for AI inference, under the conditions above. we do not share
          anything with anyone else — no analytics provider, no ad network,
          no profiling service, no marketing platform.
        </P>
        <P className="mt-3">
          folks itself is hosted on <strong>Vercel</strong>; standard
          server logs (IP, timestamp, request path) are generated when you
          load the app, the same as any website. these are retained per
          Vercel&apos;s policies and are not joined to any user identity by
          us.
        </P>
      </Section>

      <Section label="changes">
        <P>
          if we change anything material on this page, the &quot;last
          updated&quot; date above will change. the change date and a
          summary of what changed will appear here.
        </P>
      </Section>

      <Section label="contact">
        <P>
          questions about this policy can go to{' '}
          <a
            href="mailto:arthurwangtennis@gmail.com"
            style={{ color: 'var(--accent-coral)' }}
          >
            arthurwangtennis@gmail.com
          </a>
          .
        </P>
      </Section>
    </main>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="flex items-center gap-3">
        <span
          className="uppercase"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.16em',
            color: 'var(--ink-secondary)',
          }}
        >
          {label}
        </span>
        <div
          className="h-px flex-1"
          style={{ background: 'var(--border-hair)' }}
        />
      </div>
      <div className="mt-3" style={{ color: 'var(--ink-primary)' }}>
        {children}
      </div>
    </section>
  );
}

function P({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={className}
      style={{
        fontFamily: 'var(--font-fraunces)',
        fontSize: 14,
        lineHeight: 1.6,
        color: 'var(--ink-primary)',
      }}
    >
      {children}
    </p>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-start gap-2">
      <span
        aria-hidden="true"
        style={{
          color: 'var(--ink-tertiary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        ·
      </span>
      <span
        style={{
          fontFamily: 'var(--font-fraunces)',
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--ink-primary)',
        }}
      >
        {children}
      </span>
    </div>
  );
}
