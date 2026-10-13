import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PlatformInventory } from './client';
import type { PlatformOverview } from './api';

const fixture: PlatformOverview = {
  schema_version: 'solo-empire.platform-integrations.v1', generated_at: '2026-10-13T00:00:00Z',
  snapshot: { captured_at: '2026-10-12T00:00:00Z', freshness: 'fresh', revision: 'r1', lineage: {} },
  platforms: [{ id: 'codex-app', name: 'Codex App', mcp_transports: [], docs_url: 'https://example.org/docs' }, { id: 'claude-code', name: 'Claude Code', mcp_transports: [], docs_url: 'https://example.org/docs' }],
  summary: { rows_total: 1, rows_matched: 1, native_available: 1, manual_mcp_available: 1, installed: 0, authenticated: 0, health_verified: 0, paused: 0, unknown: 1, needs_review: 0 },
  rows: [{ id: 'codex-app:github', platform_id: 'codex-app', app_id: 'github', app_name: 'GitHub', category: 'Dev', registry_status: 'live', recommended_route: 'plugin', channels: {
    plugin: { availability: 'available', entries: [{ platform_id: 'codex-app', app_id: 'github', channel: 'plugin', availability: 'available', entry_id: 'github', endpoint_url: null, evidence_url: 'https://example.org/evidence', captured_at: '2026-10-12T00:00:00Z' }] },
    connector: { availability: 'unknown', entries: [] }, manual_mcp: { availability: 'available', entries: [] },
  }, connection: { installation: 'unknown', authentication: 'unknown', health: 'unknown', checked_at: null, evidence_id: null, freshness: 'unknown' } }],
};
const render = (data = fixture, platform = 'codex-app') => renderToStaticMarkup(createElement(PlatformInventory, { data, platform, onPlatformChange: () => {}, loading: false, error: '' }));

it('separates native capability, MCP fallback and unknown owner state with evidence', () => {
  const html = render();
  expect(html).toContain('Plugin: มีให้ใช้');
  expect(html).toContain('ต่อ MCP เองได้');
  expect(html).toContain('ยังไม่ตรวจ');
  expect(html).not.toContain('เชื่อมแล้ว');
  expect(html).toContain('href="https://example.org/evidence"');
});
it('marks stale catalog and stale observations as needing review', () => {
  const html = render({ ...fixture, snapshot: { ...fixture.snapshot, freshness: 'stale' }, rows: [{ ...fixture.rows[0], connection: { ...fixture.rows[0].connection, installation: 'installed', authentication: 'connected', health: 'verified', freshness: 'stale', checked_at: '2026-09-01T00:00:00Z' } }] });
  expect(html).toContain('ข้อมูลเก่า/ต้องตรวจใหม่');
  expect(html).not.toContain('สุขภาพ: ตรวจแล้ว');
  expect(html).toContain('2026-09-01');
});
it('renders controlled platform selection from backend options', () => {
  expect(render(fixture, 'claude-code')).toContain('value="claude-code" selected=""');
});
it('shows inventory error without removing its independent section', () => {
  const html = renderToStaticMarkup(createElement(PlatformInventory, { data: null, platform: 'codex-app', onPlatformChange: () => {}, loading: false, error: 'ยังไม่มีข้อมูลแพลตฟอร์มที่อ่านได้' }));
  expect(html).toContain('role="alert"');
  expect(html).toContain('ยังไม่มีข้อมูลแพลตฟอร์มที่อ่านได้');
});

it.each(['paused', 'unavailable'] as const)('keeps %s route visible without asserting connectivity', route => {
  const html = render({ ...fixture, rows: [{ ...fixture.rows[0], recommended_route: route }] });
  expect(html).toContain(route === 'paused' ? 'พักไว้' : 'ไม่มีช่องทางที่ใช้ได้');
  expect(html).not.toContain('เชื่อมแล้ว');
});

it('refuses unsafe evidence link schemes', () => {
  const row = fixture.rows[0];
  const html = render({ ...fixture, rows: [{ ...row, channels: { ...row.channels, plugin: { ...row.channels.plugin, entries: [{ ...row.channels.plugin.entries[0], evidence_url: 'javascript:alert(1)' }] } } }] });
  expect(html).not.toContain('javascript:');
});
