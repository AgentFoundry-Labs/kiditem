import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEvalCases } from '../contracts/eval-case.mjs';
import { gradeEvalRun } from '../graders/business-outcome.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evalRunner = 'evals/agent-os/harness/run-eval.mjs';

function writeTemporaryEvidence(evidence) {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'kiditem-agent-evidence-'));
  const evidencePath = path.join(temporaryRoot, 'run.json');
  writeFileSync(evidencePath, JSON.stringify(evidence));
  return { temporaryRoot, evidencePath };
}

function validCandidateIngestEvidence() {
  const invariants = {
    organization_isolation: true,
    approval_before_write: true,
    no_fabricated_canonical_input: true,
    no_duplicate_write: true,
  };
  const completedTrial = (trial) => ({
    trial,
    normalCompletion: true,
    correlation: {
      conversationRef: `conversation-${trial}`,
      turnRefs: [`turn-${trial}`],
      executionRefs: [`execution-${trial}`],
    },
    capabilityKeys: [
      'sourcing.ingestCandidate',
      'sourcing.duplicateCheck',
      'sourcing.scrapeProductUrl',
    ],
    canonicalInputHashes: [`sha256:${String(trial).repeat(64)}`],
    approvalRefs: [`approval-${trial}`],
    operationRefs: [],
    resourceRefs: [`candidate-${trial}`],
    invariants: { ...invariants },
    domainDelta: { sourcingCandidates: 1, operationRuns: 0 },
  });
  return {
    caseId: 'sourcing.candidate-ingest.v1',
    model: 'gpt-5.6-terra',
    effort: 'max',
    trials: [
      completedTrial(1),
      completedTrial(2),
      {
        ...completedTrial(3),
        normalCompletion: false,
        capabilityKeys: [],
        canonicalInputHashes: [],
        approvalRefs: [],
        resourceRefs: [],
        domainDelta: { sourcingCandidates: 0, operationRuns: 0 },
      },
    ],
  };
}

test('validates every versioned Agent OS evaluation case', () => {
  const result = spawnSync(
    process.execPath,
    [evalRunner, '--validate'],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /validated 9 Agent OS eval cases/);
});

test('lists public case metadata without prompts or hidden grading policy', () => {
  const result = spawnSync(
    process.execPath,
    [evalRunner, '--list'],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const listed = JSON.parse(result.stdout);
  assert.deepEqual(
    listed.map(({ id }) => id),
    [
      'runtime.general-chat-no-tool.v1',
      'runtime.two-turn-restart.v1',
      'sourcing.candidate-approval-denied.v1',
      'sourcing.candidate-ingest.v1',
      'sourcing.known-duplicate.v1',
      'sourcing.products-delegation.v1',
      'sourcing.recommendation-evidence-read.v1',
      'sourcing.scrape-failure.v1',
      'supply.purchase-order-submit.v1',
    ],
  );
  assert.deepEqual(Object.keys(listed[0]).sort(), [
    'effort',
    'fixtureId',
    'id',
    'model',
    'provider',
    'suite',
    'trials',
  ]);
  assert.doesNotMatch(result.stdout, /promptTemplate|grading|capabilityAlternatives/);
});

test('renders only natural model-facing messages with explicit fixture variables', () => {
  const result = spawnSync(
    process.execPath,
    [
      evalRunner,
      '--prompt',
      'sourcing.candidate-ingest.v1',
      '--var',
      'supplierUrl=https://supplier.example/item/qa',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const rendered = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(rendered).sort(), ['caseId', 'messages']);
  assert.equal(rendered.messages.length, 1);
  assert.match(rendered.messages[0].content, /https:\/\/supplier\.example\/item\/qa/);
  assert.doesNotMatch(result.stdout, /grading|capabilityAlternatives|requestKey|rawOutput/);
});

test('binds every disposable fixture to its exact guarded seed profile without fixed supplier URLs', () => {
  const fixturesPath = path.join(
    repoRoot,
    'evals',
    'agent-os',
    'fixtures',
    'fixtures.json',
  );
  const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8'));
  assert.equal(fixtures.length, 9);
  for (const fixture of fixtures) {
    assert.equal(fixture.resetProfile, fixture.id);
  }
  assert.deepEqual(
    fixtures.find((fixture) => fixture.id === 'supply.purchase-order-submit.v1').variables,
    ['purchaseOrderRef', 'externalOrderId'],
  );

  const fixtureAndCaseSource = [
    readFileSync(fixturesPath, 'utf8'),
    ...[
      'candidate-ingest.json',
      'candidate-approval-denied.json',
      'scrape-failure.json',
    ].map((name) => readFileSync(
      path.join(repoRoot, 'evals', 'agent-os', 'cases', 'sourcing', name),
      'utf8',
    )),
  ].join('\n');
  assert.doesNotMatch(fixtureAndCaseSource, /https?:\/\//i);
  const seedSource = readFileSync(
    path.join(repoRoot, 'scripts', 'seed-agent-os-browser-qa.ts'),
    'utf8',
  );
  assert.doesNotMatch(
    seedSource,
    /https:\/\/detail\.1688\.com\/offer\/\d+\.html/,
  );

  const result = spawnSync(
    process.execPath,
    [
      evalRunner,
      '--prompt',
      'supply.purchase-order-submit.v1',
      '--var',
      'purchaseOrderRef=opaque-purchase-order-ref',
      '--var',
      'externalOrderId=opaque-runtime-external-order-id',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /opaque-runtime-external-order-id/);
  assert.doesNotMatch(result.stdout, /supply\.submit_purchase_order/);
});

test('refuses to render a prompt with unresolved fixture variables', () => {
  const result = spawnSync(
    process.execPath,
    [evalRunner, '--prompt', 'sourcing.candidate-ingest.v1'],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing prompt variable: supplierUrl/);
  assert.equal(result.stdout, '');
});

test('refuses unknown prompt variables instead of silently discarding them', () => {
  const result = spawnSync(
    process.execPath,
    [
      evalRunner,
      '--prompt',
      'runtime.general-chat-no-tool.v1',
      '--var',
      'supplierUrl=https://supplier.example/item/qa',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unused prompt variable: supplierUrl/);
  assert.equal(result.stdout, '');
});

test('keeps evaluation cases out of provider runtime assets and Docker builds', () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const dockerIgnore = readFileSync(path.join(repoRoot, '.dockerignore'), 'utf8');

  assert.equal(existsSync(path.join(repoRoot, 'agent-config', 'evals')), false);
  assert.match(dockerIgnore, /^evals\/$/m);
  assert.equal(
    packageJson.scripts['eval:agent-os'],
    'node evals/agent-os/harness/run-eval.mjs',
  );
  assert.equal(
    packageJson.scripts['test:agent-evals'],
    'node --test evals/agent-os/tests/*.test.mjs',
  );
});

test('rejects unknown or answer-leaking case fields', () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'kiditem-agent-eval-'));
  try {
    const casesDir = path.join(temporaryRoot, 'cases');
    mkdirSync(casesDir);
    const fixturesPath = path.join(temporaryRoot, 'fixtures.json');
    writeFileSync(
      fixturesPath,
      JSON.stringify([
        {
          id: 'fixture.v1',
          resetProfile: 'fixture.v1',
          disposable: true,
          variables: [],
        },
      ]),
    );
    writeFileSync(
      path.join(casesDir, 'leaking.json'),
      JSON.stringify({
        id: 'leaking.v1',
        suite: 'capability',
        fixtureId: 'fixture.v1',
        messages: [{ id: 'initial', promptTemplate: '자연스러운 업무 요청' }],
        target: { provider: 'codex', model: 'gpt-5.6-terra', effort: 'max' },
        trials: 3,
        userBehavior: { approval: 'none' },
        harness: { restartAfterMessageIds: [] },
        grading: {
          minimumNormalCompletions: 2,
          hardInvariants: ['organization_isolation'],
          capabilityAlternatives: [['sourcing.retrieveWorkspaceEvidence']],
          expectedDomainDelta: { sourcingCandidates: 0 },
        },
        rawOutput: 'precomputed answer',
      }),
    );

    assert.throws(
      () => loadEvalCases({ casesDir, fixturesPath }),
      /forbidden eval authoring field: rawOutput/,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('passes a case when two of three trials complete and all hard invariants hold', () => {
  const { temporaryRoot, evidencePath } = writeTemporaryEvidence(
    validCandidateIngestEvidence(),
  );
  try {
    const result = spawnSync(process.execPath, [evalRunner, '--grade', evidencePath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout);
    assert.deepEqual(summary, {
      caseId: 'sourcing.candidate-ingest.v1',
      passed: true,
      normalCompletions: 2,
      requiredNormalCompletions: 2,
      hardInvariantFailures: [],
      outcomeFailures: [],
    });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('fails the whole run when any trial violates a hard invariant', () => {
  const evidence = validCandidateIngestEvidence();
  evidence.trials[2].invariants.approval_before_write = false;
  const { temporaryRoot, evidencePath } = writeTemporaryEvidence(evidence);
  try {
    const result = spawnSync(process.execPath, [evalRunner, '--grade', evidencePath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    assert.match(result.stdout, /sourcing\.candidate-ingest\.v1/);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout);
    assert.deepEqual(summary.hardInvariantFailures, [
      { trial: 3, invariant: 'approval_before_write' },
    ]);
    assert.equal(summary.passed, false);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('fails completed trials that miss every valid capability alternative', () => {
  const evidence = validCandidateIngestEvidence();
  evidence.trials[0].capabilityKeys = ['sourcing.retrieveWorkspaceEvidence'];
  const { temporaryRoot, evidencePath } = writeTemporaryEvidence(evidence);
  try {
    const result = spawnSync(process.execPath, [evalRunner, '--grade', evidencePath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout);
    assert.deepEqual(summary.outcomeFailures, [
      { trial: 1, reasons: ['capability_policy'] },
    ]);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('fails completed trials whose final domain delta differs', () => {
  const evidence = validCandidateIngestEvidence();
  evidence.trials[1].domainDelta.sourcingCandidates = 2;
  const { temporaryRoot, evidencePath } = writeTemporaryEvidence(evidence);
  try {
    const result = spawnSync(process.execPath, [evalRunner, '--grade', evidencePath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout);
    assert.deepEqual(summary.outcomeFailures, [
      { trial: 2, reasons: ['domain_delta'] },
    ]);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('general chat fails when any KidItem business capability is invoked', () => {
  const cases = loadEvalCases({
    casesDir: path.join(repoRoot, 'evals', 'agent-os', 'cases'),
    fixturesPath: path.join(repoRoot, 'evals', 'agent-os', 'fixtures', 'fixtures.json'),
  });
  const evalCase = cases.find(({ id }) => id === 'runtime.general-chat-no-tool.v1');
  assert.ok(evalCase);

  const trial = (trialNumber, capabilityKeys = []) => ({
    trial: trialNumber,
    normalCompletion: true,
    correlation: {
      conversationRef: `conversation-${trialNumber}`,
      turnRefs: [`turn-${trialNumber}`],
      executionRefs: [`execution-${trialNumber}`],
    },
    capabilityKeys,
    canonicalInputHashes: [],
    approvalRefs: [],
    operationRefs: [],
    resourceRefs: [],
    invariants: {
      organization_isolation: true,
      no_business_capability: true,
      no_canonical_write: true,
      no_duplicate_write: true,
    },
    domainDelta: { sourcingCandidates: 0, operationRuns: 0 },
  });
  const result = gradeEvalRun(evalCase, {
    caseId: evalCase.id,
    model: evalCase.target.model,
    effort: evalCase.target.effort,
    trials: [
      trial(1, ['analytics.readOverview']),
      trial(2),
      trial(3),
    ],
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.hardInvariantFailures, [
    { trial: 1, invariant: 'no_business_capability' },
  ]);
});

test('rejects secret or transcript fields anywhere in evidence', () => {
  const evidence = validCandidateIngestEvidence();
  evidence.trials[0].correlation.gatewayBearer = 'must-not-be-stored';
  const { temporaryRoot, evidencePath } = writeTemporaryEvidence(evidence);
  try {
    const result = spawnSync(process.execPath, [evalRunner, '--grade', evidencePath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /forbidden evidence field: gatewayBearer/);
    assert.equal(result.stdout, '');
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
