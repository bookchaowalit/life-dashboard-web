import type { Metadata } from 'next';

import ShellNav from '@/components/shell-nav';

import './globals.css';

export const metadata: Metadata = {
  title: 'Solo Empire',
  description: 'หน้าเว็บเดียวของ Solo Empire: วันนี้ งานผลิต คลังความรู้ คลาวด์',
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <ShellNav />
        {children}
      </body>
    </html>
  );
}
