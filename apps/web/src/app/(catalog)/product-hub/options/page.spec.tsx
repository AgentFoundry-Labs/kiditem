import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('/product-hub/options compatibility page', () => {
  it('preserves the former options screen at its legacy URL', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'page.tsx'), 'utf8');
    expect(source).toContain('ProductOptionsWorkspace');
    expect(source).toContain('headingLevel={1}');
    expect(source).not.toContain('redirect(');
    expect(source).not.toMatch(/apiClient\.(post|patch|delete)/);
  });
});
