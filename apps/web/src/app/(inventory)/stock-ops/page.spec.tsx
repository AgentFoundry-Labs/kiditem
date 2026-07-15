import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('StockOpsPage', () => {
  it('is a server-only query-aware compatibility redirect', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'page.tsx'), 'utf8');

    expect(source).toContain("resolveOperationsRedirect('/stock-ops'");
    expect(source).toContain('redirect(destination)');
    expect(source).not.toContain("'use client'");
    expect(source).not.toContain('useSearchParams');
    expect(source).not.toContain('./components/');
  });
});
