import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('/orders page', () => {
  it('renders its local processing workspace without redirecting', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, '../page.tsx'), 'utf8');
    expect(source).toContain("from './components/OrderProcessingWorkspace'");
    expect(source).toContain('<OrderProcessingWorkspace />');
    expect(source).not.toContain('headingLevel');
    expect(source).not.toContain('includePicking');
    expect(source).not.toContain('order-hub');
    expect(source).not.toContain('resolveOperationsRedirect');
    expect(source).not.toContain('redirect(');
  });
});
