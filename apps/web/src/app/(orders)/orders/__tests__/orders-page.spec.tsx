import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('/orders compatibility page', () => {
  it('renders the extracted processing workspace without redirecting to the replacement shell', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, '../page.tsx'), 'utf8');
    expect(source).toContain("from './components/OrderProcessingWorkspace'");
    expect(source).toContain('OrderProcessingWorkspace');
    expect(source).toContain('headingLevel={1}');
    expect(source).not.toContain('includePicking');
    expect(source).not.toContain('order-hub');
    expect(source).not.toContain('resolveOperationsRedirect');
    expect(source).not.toContain('redirect(');
  });
});
