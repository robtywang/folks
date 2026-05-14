'use client';

import { useEffect } from 'react';

/**
 * Lock body + html scroll while inside the onboarding flow. The onboarding
 * screens are designed to fit one viewport exactly — without this, iOS Safari's
 * dynamic toolbar lets the body scroll a few px on certain devices.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  return <>{children}</>;
}
