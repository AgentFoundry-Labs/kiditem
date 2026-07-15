import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('/product-hub/options compatibility page', () => {
  it('redirects to the canonical options view', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'page.tsx'), 'utf8');
    expect(source).toContain("resolveOperationsRedirect('/product-hub/options'");
    expect(source).toContain('redirect(destination)');
    expect(source).not.toContain('ProductOptionsWorkspace');
  });
});
