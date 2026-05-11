import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeReconstructionTriggers,
  missingBodyFields,
} from '../check-pr-reconstruction-contract.mjs';

test('changed file count triggers reconstruction classification', () => {
  const files = Array.from({ length: 10 }, (_, index) => `apps/server/src/ai/file-${index}.ts`);
  const triggers = analyzeReconstructionTriggers(files);
  assert.match(triggers.join('\n'), /10\+ files/);
});

test('high-risk AI media path triggers reconstruction classification', () => {
  const triggers = analyzeReconstructionTriggers([
    'apps/server/src/ai/adapter/out/gemini/detail-page-gemini-media.adapter.ts',
  ]);
  assert.match(triggers.join('\n'), /high-risk/);
});

test('large service file triggers reconstruction classification', () => {
  const file = 'apps/server/src/ai/application/service/detail-page-ai.service.ts';
  const triggers = analyzeReconstructionTriggers([file], { [file]: 700 });
  assert.match(triggers.join('\n'), /500\+ line/);
});

test('requires filled reconstruction fields', () => {
  const body = `
Trigger:
Scope decision: split included
Contract / AGENTS update: apps/server/src/ai/AGENTS.md
Behavior lock tests: prompt tests
Verification gate: npm run build --workspace=apps/server
`;
  assert.deepEqual(missingBodyFields(body), ['Trigger']);
});

test('accepts filled reconstruction fields', () => {
  const body = `
Trigger: high-risk media boundary
Scope decision: port split in this PR
Contract / AGENTS update: apps/server/src/ai/AGENTS.md
Behavior lock tests: prompt tests
Verification gate: npm run build --workspace=apps/server
`;
  assert.deepEqual(missingBodyFields(body), []);
});
