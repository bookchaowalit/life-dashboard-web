import { describe, expect, it } from 'vitest';

import { MODULES, VISIBLE_MODULES } from '../lib/modules';

describe('module visibility', () => {
  it('hides the modules whose backend is not deployed but keeps them registered', () => {
    for (const id of ['cloud', 'ai-usage', 'production']) {
      expect(MODULES.some((m) => m.id === id)).toBe(true);
      expect(VISIBLE_MODULES.some((m) => m.id === id)).toBe(false);
    }
    expect(VISIBLE_MODULES.some((m) => m.id === 'today')).toBe(false);
  });

  it('keeps the deployed metadata modules visible', () => {
    const ids = VISIBLE_MODULES.map((m) => m.id);
    for (const id of ['tasks', 'knowledge', 'accounts', 'integrations', 'saas']) expect(ids).toContain(id);
  });
});
