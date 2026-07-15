import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('/orders compatibility page', () => {
  it('renders the extracted canonical processing workspace until redirects land', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, '../page.tsx'), 'utf8');
    expect(source).toContain('OrderProcessingWorkspace');
  });
});
