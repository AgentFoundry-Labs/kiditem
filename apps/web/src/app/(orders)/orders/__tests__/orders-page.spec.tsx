import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('/orders compatibility page', () => {
  it('renders the extracted processing workspace without redirecting to the replacement shell', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, '../page.tsx'), 'utf8');
    expect(source).toContain('OrderProcessingWorkspace');
    expect(source).toContain('headingLevel={1}');
    expect(source).toContain('includePicking={false}');
    expect(source).not.toContain('resolveOperationsRedirect');
    expect(source).not.toContain('redirect(');
  });
});
