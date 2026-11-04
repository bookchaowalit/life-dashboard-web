import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => (await import('./support/render-client')).hooksModule(await vi.importActual<typeof import('react')>('react')));

import AccountsClient from '../modules/accounts/client';
import CloudClient from '../modules/cloud/client';
import IntegrationsClient from '../modules/integrations/client';
import KnowledgeClient from '../modules/knowledge/client';
import SaasClient from '../modules/saas/client';
import { renderClient } from './support/render-client';

// Fixture-only view tests for FR-12–FR-15 (accounts, integrations, SaaS, knowledge)
// and FR-18 (cloud): fetch is stubbed, no live service is called (RTM GAP-02).
const respond = (body: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => Response.json(body, { status })));
const unreachable = () => vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
const failure = (message: string) => ({ error: { message } });
afterEach(() => vi.unstubAllGlobals());

const statusDefs = [{ value: 'active', description: 'ใช้งานจริง' }];
const count = (value: string, n: number) => ({ value, count: n });

describe('accounts view (FR-12)', () => {
  const overview = (accounts: unknown[]) => ({
    schema_version: 'solo-empire.accounts.v1', generated_at: '2026-10-25T00:00:00Z',
    source: { path: 'accounts/ACCOUNT-MATRIX.yaml', updated: '2026-10-01', modified_at: '2026-10-02', status_definitions: statusDefs },
    summary: { accounts_total: 1, accounts_matched: accounts.length, groups: 1, platforms: 1, active: 1, needs_attention: 0 },
    signals: { statuses: [count('active', 1)], platforms: [count('GitHub', 1)], kinds: [count('identity', 1)] },
    anonymous: { isolation_required: true, identities: 2, platform_slots: 5, by_status: [count('planned', 2)] },
    groups: [{ id: 'g1', kind: 'identity', label: 'ตัวตนหลัก', description: '', privacy: null, face_visible: null, account_count: 1 }],
    accounts,
  });

  it('shows the heading and one account row', async () => {
    respond(overview([{ group_id: 'g1', group_kind: 'identity', platform: 'GitHub', name: 'solo-empire', purpose: 'โค้ดหลัก', status: 'active', face_visible: null, evidence: null }]));
    const html = await renderClient(AccountsClient);
    expect(html).toContain('บัญชีทุกแพลตฟอร์ม');
    for (const text of ['ตัวตนหลัก', 'GitHub', 'solo-empire', 'โค้ดหลัก', 'ใช้งาน']) expect(html).toContain(text);
  });

  it('shows the empty state', async () => {
    respond(overview([]));
    expect(await renderClient(AccountsClient)).toContain('ไม่พบบัญชีที่ตรงกัน');
  });

  it('shows the API error message', async () => {
    respond(failure('backend ล่ม'), 500);
    const html = await renderClient(AccountsClient);
    expect(html).toContain('อ่าน Accounts API ไม่ได้');
    expect(html).toContain('backend ล่ม');
  });

  it('shows the error when the backend is unreachable', async () => {
    unreachable();
    const html = await renderClient(AccountsClient);
    expect(html).toContain('อ่าน Accounts API ไม่ได้');
    expect(html).toContain('network down');
  });
});

describe('integrations view (FR-13)', () => {
  const overview = (apps: unknown[]) => ({
    schema_version: 'solo-empire.integrations.v1', generated_at: '2026-10-25T00:00:00Z',
    source: { path: 'infra/api/external_app_registry.ts', modified_at: '2026-10-02', status_definitions: statusDefs },
    summary: { apps_total: 1, apps_matched: apps.length, categories: 1, connected: 1, live: 1, mcp_only: 0, paused: 0, planned: 0, with_guide: 1 },
    signals: { statuses: [count('live', 1)], categories: [count('Payments', 1)], sections: [count('Core', 1)] },
    apps,
  });

  it('shows the heading and one app card', async () => {
    respond(overview([{ id: 'stripe', name: 'Stripe', category: 'Payments', status: 'live', api_docs: 'https://stripe.example/docs', note: 'รับชำระเงิน', section: 'Core', guide: 'integrations/stripe/' }]));
    const html = await renderClient(IntegrationsClient);
    expect(html).toContain('แอปภายนอกที่เชื่อมแล้ว');
    for (const text of ['Stripe', 'Payments', 'เชื่อมแล้ว', 'รับชำระเงิน', 'https://stripe.example/docs', 'integrations/stripe/']) expect(html).toContain(text);
  });

  it('shows the empty state', async () => {
    respond(overview([]));
    expect(await renderClient(IntegrationsClient)).toContain('ไม่พบแอปที่ตรงกัน');
  });

  it('shows the API error message', async () => {
    respond(failure('registry พัง'), 500);
    const html = await renderClient(IntegrationsClient);
    expect(html).toContain('อ่าน Integrations API ไม่ได้');
    expect(html).toContain('registry พัง');
  });
});

describe('SaaS catalog view (FR-14)', () => {
  const overview = (services: unknown[]) => ({
    schema_version: 'solo-empire.saas-catalog.v1', generated_at: '2026-10-25T00:00:00Z',
    source: { path: 'systems/cloud-platform/', snapshot_date: '2026-09-30', catalog_date: '2026-09-29', rows_requiring_current_limit_verification: '3', modified_at: '2026-10-02' },
    summary: { services_total: 1, services_matched: services.length, categories: 1, no_card: 1, commercial_yes: 1, needs_verification: 0 },
    signals: { categories: [count('Hosting', 1)], card: [count('no_card', 1)], commercial: [count('yes', 1)], lock_in: [] },
    starter_stacks: [{ use_case: 'เว็บไซต์', layer: 'Hosting', primary_free_option: 'Vercel', fallback_1: 'Netlify', fallback_2: null, why: 'ติดตั้งง่าย' }],
    services,
  });
  const service = { id: 'vercel', service: 'Vercel', category: 'Hosting', subcategory: null, free_tier_summary: '100 GB bandwidth', free_limits: '100 GB ต่อเดือน', best_use_case: 'Next.js', official_url: 'https://vercel.example', card_bucket: 'no_card', commercial_bucket: 'yes' };

  it('shows the heading and one service row', async () => {
    respond(overview([service]));
    const html = await renderClient(SaasClient);
    expect(html).toContain('บริการฟรีที่เลือกใช้ได้');
    for (const text of ['Vercel', 'Hosting', '100 GB bandwidth', 'ไม่ต้องใช้บัตร', 'ใช้เชิงพาณิชย์ได้', '100 GB ต่อเดือน', 'https://vercel.example', 'Starter stacks']) expect(html).toContain(text);
  });

  it('shows the empty state', async () => {
    respond(overview([]));
    expect(await renderClient(SaasClient)).toContain('ไม่พบบริการที่ตรงกัน');
  });

  it('shows the API error message', async () => {
    respond(failure('catalog พัง'), 500);
    const html = await renderClient(SaasClient);
    expect(html).toContain('อ่าน SaaS Catalog API ไม่ได้');
    expect(html).toContain('catalog พัง');
  });
});

describe('knowledge view (FR-15)', () => {
  const doc = { id: 'd1', path: 'knowledge/focus.md', title: 'หลักการโฟกัส', description: 'สรุปวิธีทำงานลึก', document_type: 'guide', status: 'active', root_area: 'knowledge', tags: [], has_frontmatter: true, internal_link_count: 0, created: null, updated: null, parent: null, related_count: 2 };
  const overview = (documents: unknown[]) => ({
    schema_version: 'solo-empire.knowledge.v1', generated_at: '2026-10-25T00:00:00Z',
    catalog: { modified_at: '2026-10-02', excluded_records: 0 },
    summary: { documents_total: documents.length, documents_matched: documents.length, root_areas: 1, linked_documents: 0, graph_edges: 4, with_frontmatter: 1 },
    shelves: [{ key: 'knowledge', label: 'Knowledge', count: documents.length, linked: 0 }],
    signals: { document_types: [count('guide', 1)], statuses: [count('active', 1)], top_tags: [] },
    documents,
  });

  it('shows the heading and one document row', async () => {
    respond(overview([doc]));
    const html = await renderClient(KnowledgeClient);
    expect(html).toContain('ความรู้ที่หาเจอ');
    for (const text of ['หลักการโฟกัส', 'สรุปวิธีทำงานลึก', 'knowledge/focus.md', 'guide', '2 เรื่องที่เกี่ยวข้อง', '1 เอกสาร']) expect(html).toContain(text);
  });

  it('shows the empty state', async () => {
    respond(overview([]));
    expect(await renderClient(KnowledgeClient)).toContain('ยังไม่พบเอกสารที่ตรงกัน');
  });

  it('shows the API error message', async () => {
    respond(failure('คลังปิดอยู่'), 500);
    const html = await renderClient(KnowledgeClient);
    expect(html).toContain('เปิดคลังไม่ได้');
    expect(html).toContain('คลังปิดอยู่');
  });
});

describe('cloud view (FR-18)', () => {
  const inventory = (providers: unknown[]) => ({ schema_version: 'cloud.v1', mode: 'offline', providers, summary: { providers: providers.length, healthy: providers.length, configured: 0, not_configured: 0, errors: 0, resources: 7 } });
  const route = (providers: unknown[]) => vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('/paas/actions')
    ? Response.json({ schema_version: 'cloud.v1', approval: { max_age_seconds: 600 }, providers: [{ id: 'render', name: 'Render', actions: { restart: { support: 'preflight' } } }] })
    : Response.json({ schema_version: 'cloud.v1', mode: 'offline', checked_at: '2026-10-25T05:00:00Z', inventory: inventory(providers), summary: { providers: providers.length, healthy_providers: providers.length, resource_count: 7, attention_count: 0, account_records: 1 } })));

  it('shows the heading and one provider card', async () => {
    route([{ id: 'render', name: 'Render', status: 'healthy', summary: { resources: 7 }, next_action: 'ตรวจ deploy' }]);
    const html = await renderClient(CloudClient);
    expect(html).toContain('เห็น cloud');
    for (const text of ['Render', 'พร้อมใช้งาน', 'bounded', 'ถัดไป · ตรวจ deploy', 'approval สด 10 นาที', 'restart:preflight']) expect(html).toContain(text);
  });

  it('shows the empty state', async () => {
    route([]);
    expect(await renderClient(CloudClient)).toContain('ยังไม่มี provider inventory');
  });

  it('shows the API error code and message', async () => {
    respond({ error: { code: 'cloud_down', message: 'upstream 500' } }, 500);
    const html = await renderClient(CloudClient);
    expect(html).toContain('Cloud API เชื่อมต่อไม่สำเร็จ');
    expect(html).toContain('cloud_down · upstream 500');
  });

  it('shows the generic error when the backend is unreachable', async () => {
    unreachable();
    expect(await renderClient(CloudClient)).toContain('ไม่สามารถอ่าน Cloud API ได้');
  });
});
