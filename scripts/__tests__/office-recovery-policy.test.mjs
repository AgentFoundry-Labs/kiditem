import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const policyPath = `${root}/deploy/office/recovery-operation-policy.json`;
const scriptPath = `${root}/deploy/office/apply-deployment.ps1`;

const loadPolicy = () => {
  assert.ok(
    existsSync(policyPath),
    'Office recovery decisions must come from the shared JSON policy',
  );
  return JSON.parse(readFileSync(policyPath, 'utf8'));
};

const matches = (expected, actual) =>
  expected === 'any' || expected === actual;

const operationAllowed = (policy, scenario) => {
  const rule = policy.operationRules.find(
    (candidate) =>
      matches(candidate.markerStatus, scenario.markerStatus) &&
      matches(candidate.operation, scenario.operation) &&
      matches(candidate.applySchema, scenario.applySchema) &&
      matches(candidate.currentManifestIdentity, scenario.currentManifestIdentity),
  );
  return rule?.decision === 'allow';
};

const deploymentTransition = (policy, scenario) => {
  const rule = policy.deploymentTransitions.find(
    (candidate) =>
      matches(candidate.markerStatusAtStart, scenario.markerStatusAtStart) &&
      matches(candidate.deploymentKind, scenario.deploymentKind) &&
      matches(candidate.currentManifestIdentity, scenario.currentManifestIdentity) &&
      matches(
        candidate.destructiveBoundaryEntered,
        scenario.destructiveBoundaryEntered,
      ) &&
      matches(candidate.outcome, scenario.outcome),
  );
  assert.ok(rule, `missing deployment transition for ${JSON.stringify(scenario)}`);
  return {
    runtimeAction: rule.runtimeAction,
    markerAction: rule.markerAction,
  };
};

test('deployed destructive marker allows only identity-matched application deploy', () => {
  const policy = loadPolicy();
  const cases = [
    {
      name: 'matching application-only deploy',
      operation: 'Deploy',
      applySchema: false,
      acceptDataLoss: false,
      currentManifestIdentity: 'candidate',
      allowed: true,
    },
    {
      name: 'mismatched application-only deploy',
      operation: 'Deploy',
      applySchema: false,
      acceptDataLoss: false,
      currentManifestIdentity: 'not-candidate',
      allowed: false,
    },
    {
      name: 'schema deploy without accepted data loss',
      operation: 'Deploy',
      applySchema: true,
      acceptDataLoss: false,
      currentManifestIdentity: 'candidate',
      allowed: false,
    },
    {
      name: 'schema deploy with accepted data loss',
      operation: 'Deploy',
      applySchema: true,
      acceptDataLoss: true,
      currentManifestIdentity: 'candidate',
      allowed: false,
    },
    {
      name: 'runtime-only rollback',
      operation: 'Rollback',
      applySchema: false,
      acceptDataLoss: false,
      currentManifestIdentity: 'candidate',
      allowed: false,
    },
  ];

  for (const scenario of cases) {
    assert.equal(
      operationAllowed(policy, { markerStatus: 'deployed', ...scenario }),
      scenario.allowed,
      scenario.name,
    );
  }
});

test('recovery marker lifecycle distinguishes pre-boundary and post-boundary failures', () => {
  const policy = loadPolicy();
  const cases = [
    {
      name: 'schema push failure before a destructive boundary',
      scenario: {
        markerStatusAtStart: 'none',
        deploymentKind: 'schema',
        currentManifestIdentity: 'none',
        destructiveBoundaryEntered: false,
        outcome: 'failure',
      },
      expected: {
        runtimeAction: 'restore-transaction',
        markerAction: 'preserve',
      },
    },
    {
      name: 'health or finalization failure after destructive push',
      scenario: {
        markerStatusAtStart: 'none',
        deploymentKind: 'schema',
        currentManifestIdentity: 'none',
        destructiveBoundaryEntered: true,
        outcome: 'failure',
      },
      expected: {
        runtimeAction: 'stop-writers',
        markerAction: 'require-recovery',
      },
    },
    {
      name: 'application-only failure from compatible destructive candidate',
      scenario: {
        markerStatusAtStart: 'deployed',
        deploymentKind: 'application-only',
        currentManifestIdentity: 'candidate',
        destructiveBoundaryEntered: false,
        outcome: 'failure',
      },
      expected: {
        runtimeAction: 'restore-transaction',
        markerAction: 'preserve',
      },
    },
  ];

  for (const { name, scenario, expected } of cases) {
    assert.deepEqual(deploymentTransition(policy, scenario), expected, name);
  }
});

test('destructive marker clears only after full application-only success', () => {
  const policy = loadPolicy();
  const base = {
    markerStatusAtStart: 'deployed',
    deploymentKind: 'application-only',
    currentManifestIdentity: 'candidate',
    destructiveBoundaryEntered: false,
  };

  assert.deepEqual(
    deploymentTransition(policy, { ...base, outcome: 'failure' }),
    { runtimeAction: 'restore-transaction', markerAction: 'preserve' },
  );
  assert.deepEqual(
    deploymentTransition(policy, { ...base, outcome: 'full-success' }),
    { runtimeAction: 'keep-runtime', markerAction: 'archive-remove' },
  );
});

test('PowerShell operator consumes shared policy and records candidate manifest identity', () => {
  const script = readFileSync(scriptPath, 'utf8');

  assert.match(script, /recovery-operation-policy\.json/);
  assert.match(script, /Test-RecoveryOperationAllowed/);
  assert.match(script, /Get-RecoveryDeploymentTransition/);
  assert.match(script, /candidateManifestSha256/);
  assert.match(script, /\$state\.schemaVersion -ne 2/);
  assert.match(script, /schemaVersion = 2/);
  assert.doesNotMatch(
    script,
    /\$state\.status -eq 'deployed' -and \$RequestedOperation -eq 'Deploy'\) \{\s*return/,
  );
});

test('PowerShell applies recovery policy before mutation and clears marker only after finalization', () => {
  const script = readFileSync(scriptPath, 'utf8');
  const installStart = script.indexOf('function Install-Deployment {');
  const installEnd = script.indexOf('\nfunction Show-OfficeStatus {', installStart);
  const install = script.slice(installStart, installEnd);

  const operationGuard = install.indexOf('Assert-OperationAllowedByRecoveryState');
  const firstMutationGuard = install.indexOf('Assert-DiskCapacity');
  const smokeSuccess = install.indexOf('Assert-SmokeTests');
  const currentManifestWrite = install.indexOf(
    '$bundle.Raw | Set-Content -LiteralPath $script:CurrentManifestPath',
  );
  const markerArchive = install.indexOf(
    "Archive-RecoveryState 'superseded-by-compatible-forward-deploy'",
  );
  const markerRemove = install.indexOf(
    'Remove-Item -LiteralPath $script:RecoveryStatePath',
  );

  assert.ok(operationGuard >= 0 && operationGuard < firstMutationGuard);
  assert.ok(markerArchive > smokeSuccess);
  assert.ok(markerArchive > currentManifestWrite);
  assert.ok(markerRemove > markerArchive);
});

test('PowerShell refuses to replace an existing destructive recovery marker', () => {
  const script = readFileSync(scriptPath, 'utf8');
  const artifactStart = script.indexOf(
    'function New-DestructiveRecoveryArtifact {',
  );
  const artifactEnd = script.indexOf(
    '\nfunction Get-ContainerState {',
    artifactStart,
  );
  const artifact = script.slice(artifactStart, artifactEnd);

  const existingMarkerGuard = artifact.indexOf(
    'if (Test-Path -LiteralPath $script:RecoveryStatePath -PathType Leaf)',
  );
  const dumpCapture = artifact.indexOf(
    'Invoke-Checked docker exec kiditem-postgres pg_dump',
  );

  assert.ok(existingMarkerGuard >= 0 && existingMarkerGuard < dumpCapture);
  assert.match(
    artifact,
    /throw 'A destructive schema recovery marker already exists/,
  );
  assert.match(artifact, /Save-NewRecoveryState \$state/);
  assert.doesNotMatch(artifact, /superseded-by-new-quiesced-dump/);

  const createStart = script.indexOf('function Save-NewRecoveryState {');
  const createEnd = script.indexOf('\nfunction Archive-RecoveryState {', createStart);
  const create = script.slice(createStart, createEnd);
  assert.match(create, /\[System\.IO\.File\]::Move/);
  assert.doesNotMatch(create, /Move-Item[^\n]*-Force/);
});

test('Office workflow bundles the shared recovery policy', () => {
  const workflow = readFileSync(
    `${root}/.github/workflows/office-images.yml`,
    'utf8',
  );

  assert.match(workflow, /cp deploy\/office\/recovery-operation-policy\.json/);
});
