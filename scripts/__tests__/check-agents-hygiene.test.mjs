import test from 'node:test';
import assert from 'node:assert/strict';
import * as agentsHygiene from '../check-agents-hygiene.mjs';
import { findStaleInstructionLines } from '../check-agents-hygiene.mjs';

test('flags stale phase and PR history in instruction files', () => {
  const findings = findStaleInstructionLines(
    'apps/server/src/foo/CLAUDE.md',
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
    'CLAUDE.md',
    '- **No follow-up issues** - apply all files in scope.\n',
  );
  assert.equal(findings.length, 0);
});

test('flags legacy AGENTS instruction files', () => {
  assert.equal(typeof agentsHygiene.findLegacyInstructionFindings, 'function');

  const findings = agentsHygiene.findLegacyInstructionFindings([
    'AGENTS.md',
    'apps/web/AGENTS.md',
  ]);

  assert.deepEqual(findings, [{
    file: 'AGENTS.md',
    line: 1,
    name: 'legacy instruction file',
    text: 'Instruction guides must use CLAUDE.md; remove the legacy AGENTS file',
  }, {
    file: 'apps/web/AGENTS.md',
    line: 1,
    name: 'legacy instruction file',
    text: 'Instruction guides must use CLAUDE.md; remove the legacy AGENTS file',
  }]);
});

test('flags an active CLAUDE.md chain that reaches the configured byte limit', () => {
  assert.equal(typeof agentsHygiene.findInstructionChainSizeFindings, 'function');

  const findings = agentsHygiene.findInstructionChainSizeFindings(
    new Map([
      ['CLAUDE.md', '123456'],
      ['apps/web/CLAUDE.md', 'abcdef'],
    ]),
    10,
  );

  assert.deepEqual(findings, [{
    file: 'apps/web/CLAUDE.md',
    line: 1,
    name: 'CLAUDE.md active chain reached byte limit',
    text: 'Active CLAUDE.md chain is 12 bytes; it must stay below 10 bytes',
  }]);
});

test('uses the Codex 32 KiB project-instruction limit by default', () => {
  const belowLimit = agentsHygiene.findInstructionChainSizeFindings(
    new Map([['CLAUDE.md', 'x'.repeat((32 * 1024) - 1)]]),
  );
  const atLimit = agentsHygiene.findInstructionChainSizeFindings(
    new Map([['CLAUDE.md', 'x'.repeat(32 * 1024)]]),
  );

  assert.equal(belowLimit.length, 0);
  assert.equal(atLimit.length, 1);
});
