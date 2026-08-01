import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('operations platform boundary', () => {
  it('is a documented platform owner', () => {
    expect(read('AGENTS.md')).toContain(
      '| `operations` | operation catalog, schedules, run envelope, engine dispatch |',
    );
    expect(read('docs/ARCHITECTURE.md')).toContain('apps/server/src/operations');
  });
});
