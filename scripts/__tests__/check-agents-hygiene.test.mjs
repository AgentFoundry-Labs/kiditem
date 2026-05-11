import test from 'node:test';
import assert from 'node:assert/strict';
import { findStaleInstructionLines } from '../check-agents-hygiene.mjs';

test('flags stale phase and PR history in instruction files', () => {
  const findings = findStaleInstructionLines(
    'apps/server/src/foo/AGENTS.md',
    'Phase 3 완료: old migration note\nPR #123 changed this\n',
  );
  assert.equal(findings.length, 2);
  assert.deepEqual(
    findings.map((finding) => finding.name),
    ['phase/wave history', 'PR-number history'],
  );
});

test('allows root no-follow-up policy wording', () => {
  const findings = findStaleInstructionLines(
    'AGENTS.md',
    '- **No follow-up issues** - apply all files in scope.\n',
  );
  assert.equal(findings.length, 0);
});
