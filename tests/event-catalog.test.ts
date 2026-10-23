import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BROWSER_EVENTS } from '@/lib/browser-analytics';

// The event catalog (docs/measurement/EVENTS.md) and the code must agree: every
// listed event has a call site and a test, and the code cannot send an event
// the catalog does not list.
const root = resolve(__dirname, '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const catalog = read('docs/measurement/EVENTS.md');

const events = catalog
  .slice(catalog.indexOf('## Events'), catalog.indexOf('## Identity'))
  .split('\n')
  .filter((line) => /^\| `/.test(line))
  .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
  .map(([name, , properties, , callSite, tests]) => ({
    name: name.replace(/`/g, ''),
    properties,
    callFile: callSite.match(/`([^`]+)`/)![1],
    tests: [...tests.matchAll(/`([^`]+)`/g)].map((m) => m[1]),
  }));
const listed = new Set(events.map((e) => e.name));

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('event catalog', () => {
  it('lists the page view and the owner actions', () => {
    expect([...listed].sort()).toEqual(['$pageview', 'habit_logged', 'owner_write_failed', 'task_status_changed']);
  });

  it('every catalog event has a call site that names it', () => {
    for (const event of events) {
      const source = read(event.callFile);
      if (event.name === '$pageview') expect(source, event.callFile).toMatch(/analytics\.page\(/);
      else expect(source, `${event.name} in ${event.callFile}`).toMatch(new RegExp(`['"]${event.name}['"]`));
    }
  });

  it('every catalog event has a test that names it', () => {
    for (const event of events) {
      expect(event.tests.length, event.name).toBeGreaterThan(0);
      const word = event.name === '$pageview' ? 'page(' : event.name;
      expect(event.tests.some((file) => read(file).includes(word)), `${event.name} in ${event.tests.join(', ')}`).toBe(true);
    }
  });

  it('the code cannot send an event the catalog does not list, and each listed property value is in the catalog', () => {
    for (const [name, props] of Object.entries(BROWSER_EVENTS)) {
      expect(listed.has(name), name).toBe(true);
      const row = events.find((e) => e.name === name)!;
      for (const [key, values] of Object.entries(props)) {
        expect(row.properties, `${name}.${key}`).toContain(`\`${key}\``);
        for (const value of values) expect(row.properties, `${name}.${key}=${value}`).toContain(`\`${value}\``);
      }
    }
    for (const name of listed) if (name !== '$pageview') expect(Object.keys(BROWSER_EVENTS)).toContain(name);
  });

  it('call sites in app, modules, components and lib only name catalog events', () => {
    const files = ['app', 'modules', 'components', 'lib'].flatMap(sourceFiles);
    for (const file of files) {
      const text = read(file);
      for (const [, name] of text.matchAll(/analytics\.track\(\s*'([^']+)'/g)) expect(listed.has(name), `${file}: ${name}`).toBe(true);
      for (const [, name] of text.matchAll(/event:\s*'([a-z_]+)'/g)) expect(listed.has(name), `${file}: ${name}`).toBe(true);
    }
  });
});

describe('dashboard spec', () => {
  it('is valid JSON, covers every PostHog KPI, guards min volume and references only catalog events', () => {
    const spec = JSON.parse(read('analytics/posthog/dashboard.json'));
    expect(spec.product).toBe('life-dashboard');
    const kpis = new Set(spec.insights.map((i: { kpi: string | null }) => i.kpi).filter(Boolean));
    for (const kpi of ['KPI-O-01', 'KPI-L-01', 'KPI-L-02', 'KPI-L-03', 'KPI-L-04', 'KPI-G-01']) expect(kpis.has(kpi), kpi).toBe(true);
    expect(spec.insights.some((i: { kpi: string | null; name: string }) => i.kpi === null && /first-event/i.test(i.name))).toBe(true);
    for (const insight of spec.insights) {
      expect(insight.query.kind).toBe('HogQLQuery');
      expect(insight.query.query, insight.name).toContain("properties.product = 'life-dashboard'");
      if (insight.kpi) {
        expect(insight.min_volume, insight.name).toBeTruthy();
        expect(insight.query.query, `${insight.name} min-volume guard`).toMatch(/if\(/);
      }
      for (const name of insight.events) expect(listed.has(name), `${insight.name}: ${name}`).toBe(true);
      for (const [, name] of insight.query.query.matchAll(/'(\$?[a-z_]+)'/g)) {
        if (/^(\$pageview|[a-z]+_[a-z_]+)$/.test(name) && !['life-dashboard'].includes(name)) expect(listed.has(name), `${insight.name}: ${name}`).toBe(true);
      }
    }
  });
});

describe('outcome review file', () => {
  it('OR-301, pending go-live, decisions table with a placeholder row, not a template', () => {
    const review = read('docs/measurement/OUTCOME-REVIEW-001.md');
    const front = review.slice(0, review.indexOf('\n---', 3));
    expect(front).not.toMatch(/status:\s*template/);
    expect(review).toMatch(/\| Review ID \| OR-301 \|/);
    expect(review).toMatch(/\| Status \| pending go-live \|/);
    expect(review).toContain('| # | Decision | Type | Owner | Due | Tracked in |');
    expect(review).toMatch(/\| 1 \| \[[^\]]+\] \|/);
  });
});
