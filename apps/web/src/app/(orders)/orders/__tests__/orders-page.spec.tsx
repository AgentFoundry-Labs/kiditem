import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('/orders compatibility page', () => {
  it('redirects to the canonical processing workspace', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, '../page.tsx'), 'utf8');
    expect(source).toContain("resolveOperationsRedirect('/orders'");
    expect(source).toContain('redirect(destination)');
    expect(source).not.toContain('OrderProcessingWorkspace');
  });
});
