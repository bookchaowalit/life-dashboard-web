import type { Metadata, Viewport } from 'next';

import AnalyticsProvider from '@/components/analytics/analytics-provider';
import ShellNav from '@/components/shell-nav';
import { readConfig } from '@/lib/browser-analytics';

import './globals.css';

export const metadata: Metadata = {
  title: 'Solo Empire',
  description: 'หน้าเว็บเดียวของ Solo Empire: วันนี้ งานผลิต คลังความรู้ คลาวด์',
  appleWebApp: { capable: true, title: 'Solo Empire', statusBarStyle: 'black' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = { themeColor: '#1d211f' };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <ShellNav />
        {children}
        {/* Consent banner and page views; absent (and posthog-js never loaded) unless analytics is configured. */}
        {readConfig() && <AnalyticsProvider />}
      </body>
    </html>
  );
}
