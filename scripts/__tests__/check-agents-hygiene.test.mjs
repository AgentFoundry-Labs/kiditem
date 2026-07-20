import test from 'node:test';
import assert from 'node:assert/strict';
import * as agentsHygiene from '../check-agents-hygiene.mjs';
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

test('flags an AGENTS.md without a same-directory CLAUDE.md shim', () => {
  assert.equal(typeof agentsHygiene.findClaudeShimFindings, 'function');

  const findings = agentsHygiene.findClaudeShimFindings(
    ['AGENTS.md', 'apps/web/AGENTS.md'],
    new Map([['CLAUDE.md', '@AGENTS.md\n']]),
  );

  assert.deepEqual(findings, [{
    file: 'apps/web/CLAUDE.md',
    line: 1,
    name: 'missing CLAUDE.md shim',
    text: 'Every AGENTS.md must have a same-directory CLAUDE.md containing only @AGENTS.md',
  }]);
});

test('flags a CLAUDE.md shim whose content drifts from @AGENTS.md', () => {
  const findings = agentsHygiene.findClaudeShimFindings(
    ['AGENTS.md'],
    new Map([['CLAUDE.md', 'Duplicated instructions\n']]),
  );

  assert.deepEqual(findings, [{
    file: 'CLAUDE.md',
    line: 1,
    name: 'CLAUDE.md drift',
    text: 'CLAUDE.md must contain only @AGENTS.md',
  }]);
});

test('flags a CLAUDE.md shim without a same-directory AGENTS.md', () => {
  const findings = agentsHygiene.findClaudeShimFindings(
    [],
    new Map([['apps/web/CLAUDE.md', '@AGENTS.md\n']]),
  );

  assert.deepEqual(findings, [{
    file: 'apps/web/CLAUDE.md',
    line: 1,
    name: 'orphan CLAUDE.md shim',
    text: 'CLAUDE.md shim requires a same-directory AGENTS.md',
  }]);
});

test('flags an active AGENTS.md chain that exceeds the configured byte limit', () => {
  assert.equal(typeof agentsHygiene.findInstructionChainSizeFindings, 'function');

  const findings = agentsHygiene.findInstructionChainSizeFindings(
    new Map([
      ['AGENTS.md', '123456'],
      ['apps/web/AGENTS.md', 'abcdef'],
    ]),
    10,
  );

  assert.deepEqual(findings, [{
    file: 'apps/web/AGENTS.md',
    line: 1,
    name: 'AGENTS.md active chain too large',
    text: 'Active AGENTS.md chain is 12 bytes; limit is 10 bytes',
  }]);
});
