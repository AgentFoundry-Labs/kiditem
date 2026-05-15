import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSharedInterfaceNames } from '../check-shared-interface-names.mjs';

test('accepts public Zod contracts named FooSchema', () => {
  const result = analyzeSharedInterfaceNames({
    files: {
      'packages/shared/src/example.ts': `
        import { z } from 'zod';
        export const ExampleItemSchema = z.object({ id: z.string() });
        export type ExampleItem = z.infer<typeof ExampleItemSchema>;
      `,
    },
    baseline: '',
  });

  assert.deepEqual(result.newViolations, []);
  assert.deepEqual(result.staleBaselineEntries, []);
});

test('flags new exported Zod contracts that do not end with Schema', () => {
  const result = analyzeSharedInterfaceNames({
    files: {
      'packages/shared/src/example.ts': `
        import { z } from 'zod';
        export const exampleItem = z.object({ id: z.string() });
      `,
    },
    baseline: '',
  });

  assert.deepEqual(result.newViolations, [
    'packages/shared/src/example.ts:exampleItem',
  ]);
});

test('allows existing baseline violations but reports stale baseline entries', () => {
  const result = analyzeSharedInterfaceNames({
    files: {
      'packages/shared/src/example.ts': `
        import { z } from 'zod';
        export const ExampleItemSchema = z.object({ id: z.string() });
      `,
    },
    baseline: 'packages/shared/src/example.ts:oldContract\n',
  });

  assert.deepEqual(result.newViolations, []);
  assert.deepEqual(result.staleBaselineEntries, [
    'packages/shared/src/example.ts:oldContract',
  ]);
});
