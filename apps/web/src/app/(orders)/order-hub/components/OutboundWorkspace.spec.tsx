import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('OutboundWorkspace', () => {
  it('is retained for the outbound tab rendered by order hub', () => {
    const source = readFileSync(
      path.join(import.meta.dirname, 'OutboundWorkspace.tsx'),
      'utf8',
    );
    const orderHubPage = readFileSync(
      path.resolve(import.meta.dirname, '../page.tsx'),
      'utf8',
    );

    expect(source).toContain('export function OutboundWorkspace');
    expect(orderHubPage).toContain("import { OutboundWorkspace } from './components/OutboundWorkspace'");
    expect(orderHubPage).toContain('content: <OutboundWorkspace headingLevel={2} />');
  });
});
