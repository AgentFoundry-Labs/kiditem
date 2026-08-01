import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('useDepartmentQuickActions boundaries', () => {
  it('does not execute another route group in the dashboard bundle', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/(analytics)/dashboard/hooks/use-department-quick-actions.ts'),
      'utf8',
    );

    expect(source).not.toContain("@/app/(orders)/");
    expect(source).not.toContain("@/app/(inventory)/");
  });
});
