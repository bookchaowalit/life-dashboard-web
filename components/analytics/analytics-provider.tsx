'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { analytics } from '@/lib/browser-analytics';

import { ConsentBanner, ConsentChoicesLink, panelState } from './consent-banner';

// Sends one page view per route (cleaned path only) and shows the consent
// banner. Rendered from app/layout.tsx only when analytics is configured.
// No identify: the session only holds the owner's Google `sub`, which is not a
// pseudonymous id of our own, and there is one user, so events stay anonymous.
export default function AnalyticsProvider() {
  const pathname = usePathname();
  const consent = useSyncExternalStore(analytics.subscribe, analytics.consent, () => 'unknown' as const);
  const [reopened, setReopened] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (consent !== 'granted' || !pathname) return;
    analytics.page(pathname);
    // The login page is the signed-out state: forget any stored identity.
    if (pathname === '/login') analytics.forgetIdentity();
  }, [pathname, consent]);

  const choose = (value: 'granted' | 'denied') => {
    analytics.setConsent(value);
    setReopened(false);
  };

  const state = panelState(analytics.enabled, consent, reopened, mounted);
  if (state === 'hidden') return null;
  if (state === 'choices') return <ConsentChoicesLink onOpen={() => setReopened(true)} />;
  return <ConsentBanner onAccept={() => choose('granted')} onDecline={() => choose('denied')} />;
}
