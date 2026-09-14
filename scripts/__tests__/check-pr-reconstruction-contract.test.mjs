import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

test('tolerates Markdown bold/italic/code wrapping around labels', () => {
  const body = `
**Trigger**: high-risk media boundary
*Scope decision*: port split in this PR
__Contract / AGENTS update__: apps/server/src/ai/AGENTS.md
\`Behavior lock tests\`: prompt tests
Verification gate: npm run build --workspace=apps/server
`;
  assert.deepEqual(missingBodyFields(body), []);
});

test('flags blank values even when the label is wrapped in Markdown', () => {
  const body = `
**Trigger**:
**Scope decision**: split included
**Contract / AGENTS update**: apps/server/src/ai/AGENTS.md
**Behavior lock tests**: prompt tests
**Verification gate**: npm run build --workspace=apps/server
`;
  assert.deepEqual(missingBodyFields(body), ['Trigger']);
});

const guardPath = fileURLToPath(
  new URL('../check-pr-reconstruction-contract.mjs', import.meta.url),
);

const triggerFiles = Array.from(
  { length: 10 },
  (_, index) => `apps/server/src/ai/file-${index}.ts`,
).join(',');

// `gh pr view` is the last-resort body source. Shadow it so a `--body-file`
// regression cannot be masked by whatever PR body the current branch has.
function withoutGh() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pr-reconstruction-guard-'));
  writeFileSync(path.join(dir, 'gh'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  return dir;
}

function runGuard(bodyPath, shimDir) {
  return execFileSync('node', [guardPath, '--files', triggerFiles, '--body-file', bodyPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ''}`,
      GITHUB_ACTIONS: '',
      GITHUB_EVENT_PATH: '',
    },
  });
}

test('--body-file with filled fields passes', () => {
  const shimDir = withoutGh();
  const bodyPath = path.join(shimDir, 'body.md');
  writeFileSync(
    bodyPath,
    [
      '## Architecture / Reconstruction Review',
      'Trigger: high-risk media boundary',
      'Scope decision: port split in this PR',
      'Contract / AGENTS update: apps/server/src/ai/AGENTS.md',
      'Behavior lock tests: prompt tests',
      'Verification gate: npm run build --workspace=apps/server',
      '',
    ].join('\n'),
  );

  try {
    assert.match(runGuard(bodyPath, shimDir), /check:pr-reconstruction PASS/);
  } finally {
    rmSync(shimDir, { recursive: true, force: true });
  }
});

test('--body-file with a missing field fails', () => {
  const shimDir = withoutGh();
  const bodyPath = path.join(shimDir, 'body.md');
  writeFileSync(
    bodyPath,
    [
      '## Architecture / Reconstruction Review',
      'Trigger:',
      'Scope decision: port split in this PR',
      'Contract / AGENTS update: apps/server/src/ai/AGENTS.md',
      'Behavior lock tests: prompt tests',
      'Verification gate: npm run build --workspace=apps/server',
      '',
    ].join('\n'),
  );

  try {
    assert.throws(
      () => runGuard(bodyPath, shimDir),
      (error) => {
        assert.equal(error.status, 1);
        assert.match(error.stderr, /Missing or blank PR body fields: Trigger$/m);
        return true;
      },
    );
  } finally {
    rmSync(shimDir, { recursive: true, force: true });
  }
});
