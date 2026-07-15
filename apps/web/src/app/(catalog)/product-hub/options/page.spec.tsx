import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('/product-hub/options compatibility page', () => {
  it('renders the extracted options workspace until redirects land', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'page.tsx'), 'utf8');
    expect(source).toContain('ProductOptionsWorkspace');
    expect(source).toContain('headingLevel={1}');
  });
});
