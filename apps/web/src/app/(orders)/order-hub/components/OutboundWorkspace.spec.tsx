import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('OutboundWorkspace', () => {
  it('is the single outbound implementation rendered by the former standalone route', () => {
    const source = readFileSync(
      path.join(import.meta.dirname, 'OutboundWorkspace.tsx'),
      'utf8',
    );
    const legacyPage = readFileSync(
      path.resolve(import.meta.dirname, '../../../(inventory)/outbound/page.tsx'),
      'utf8',
    );

    expect(source).toContain('export function OutboundWorkspace');
    expect(legacyPage).toContain('OutboundWorkspace');
    expect(legacyPage).toContain('headingLevel={1}');
    expect(legacyPage).not.toContain('resolveOperationsRedirect');
  });
});
