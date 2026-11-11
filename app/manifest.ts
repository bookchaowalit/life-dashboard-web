import type { MetadataRoute } from 'next';

// Installable PWA (interface-coverage S-life-os-pwa). No service worker on purpose: owner data is
// live and personal, so nothing is cached for offline use. Colours match the shell (globals.css).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Solo Empire',
    short_name: 'Solo Empire',
    description: 'หน้าเว็บเดียวของ Solo Empire: วันนี้ งานผลิต คลังความรู้ คลาวด์',
    lang: 'th',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f7f4',
    theme_color: '#1d211f',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
