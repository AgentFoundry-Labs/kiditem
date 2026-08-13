import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const clone = (value) => JSON.parse(JSON.stringify(value));

const executeDeploymentPlan = (
  policy,
  {
    planName,
    marker = null,
    currentManifestIdentity = 'none',
    faultAt = null,
    failRecoveryRequiredWrite = false,
  },
) => {
  const plan = policy.deploymentActionPlans?.[planName];
  assert.ok(Array.isArray(plan), `missing deployment action plan ${planName}`);
  const markerAtStart = clone(marker);
  let markerOnDisk = clone(marker);
  let destructiveBoundaryEntered = false;
  const trace = [];
  const deploymentKind = planName.startsWith('destructive')
    ? 'schema'
    : 'application-only';

  const fail = (failedAction) => {
    const failureKind =
      failedAction === 'marker-create' ? 'recovery-capture' : deploymentKind;
    const transition = deploymentTransition(policy, {
      markerStatusAtStart: markerAtStart?.status ?? 'none',
      deploymentKind: failureKind,
      currentManifestIdentity,
      destructiveBoundaryEntered,
      outcome: 'failure',
    });
    trace.push(transition.runtimeAction);
    if (transition.markerAction === 'require-recovery') {
      trace.push('recovery-required-status');
      if (failRecoveryRequiredWrite) {
        trace.push('recovery-required-status-failed');
      } else if (markerOnDisk) {
        markerOnDisk.status = 'recovery-required';
      }
    }
    return { trace, markerOnDisk, transition };
  };

  for (const action of plan) {
    trace.push(action);
    if (action === 'schema-push') {
      // A failed non-transactional push is conservatively inside the boundary.
      destructiveBoundaryEntered = true;
    }
    if (faultAt === action) {
      return fail(action);
    }
    if (action === 'marker-create') {
      markerOnDisk = { status: 'prepared', bytes: 'prepared-marker' };
    } else if (action === 'schema-push-completed-status') {
      markerOnDisk.status = 'schema-push-completed';
      markerOnDisk.bytes = 'schema-push-completed-marker';
    } else if (action === 'deployed-status') {
      markerOnDisk.status = 'deployed';
      markerOnDisk.bytes = 'deployed-marker';
    } else if (action === 'marker-remove') {
      markerOnDisk = null;
    }
  }

  return { trace, markerOnDisk, transition: null };
};

const waitForExit = (child) =>
  new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });

const waitForLine = (stream, expected) =>
  new Promise((resolve, reject) => {
    let output = '';
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes(expected)) {
        stream.off('data', onData);
        resolve(output);
      }
    };
    stream.on('data', onData);
    stream.once('error', reject);
  });

const fileLockProbe = String.raw`
import fcntl
import sys

lock_path, action_path, action, mode = sys.argv[1:]
handle = open(lock_path, 'a+')
try:
    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    print('CONTENDED', flush=True)
    sys.exit(73)
with open(action_path, 'a') as action_log:
    action_log.write(action + '\n')
print('ACQUIRED', flush=True)
if mode == 'hold':
    sys.stdin.readline()
elif mode == 'fail':
    sys.exit(74)
`;

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

test('shared action plans deny every recovery-bound mutation before its first action', () => {
  const policy = loadPolicy();
  const statuses = ['prepared', 'schema-push-completed', 'recovery-required'];
  const operations = ['Deploy', 'Rollback'];

  for (const markerStatus of statuses) {
    for (const operation of operations) {
      for (const applySchema of [false, true]) {
        for (const currentManifestIdentity of [
          'none',
          'candidate',
          'not-candidate',
        ]) {
          assert.equal(
            operationAllowed(policy, {
              markerStatus,
              operation,
              applySchema,
              currentManifestIdentity,
            }),
            false,
            `${markerStatus}/${operation}/${applySchema}/${currentManifestIdentity}`,
          );
        }
      }
    }
  }

  for (const applySchema of [false, true]) {
    for (const currentManifestIdentity of ['none', 'not-candidate']) {
      assert.equal(
        operationAllowed(policy, {
          markerStatus: 'deployed',
          operation: 'Deploy',
          applySchema,
          currentManifestIdentity,
        }),
        false,
      );
    }
  }
});

test('destructive action plan keeps schema-push-completed until final deployed status', () => {
  const policy = loadPolicy();
  assert.equal(policy.schemaVersion, 2);
  const plan = policy.deploymentActionPlans?.['destructive-schema'];
  const expectedFallibleFinalization = [
    'candidate-health',
    'smoke',
    'previous-manifest',
    'current-manifest',
    'history-manifest',
    'bundle',
  ];

  assert.ok(Array.isArray(plan));
  assert.ok(plan.indexOf('schema-push-completed-status') > plan.indexOf('schema-push'));
  for (const action of expectedFallibleFinalization) {
    assert.ok(
      plan.indexOf(action) > plan.indexOf('schema-push-completed-status'),
      `${action} must follow schema-push-completed status`,
    );
    assert.ok(
      plan.indexOf(action) < plan.indexOf('deployed-status'),
      `${action} must precede deployed status`,
    );
  }
  assert.equal(plan.at(-1), 'deployed-status');
});

test('fault plan preserves the last atomic marker across every destructive boundary failure', () => {
  const policy = loadPolicy();
  const dumpFailure = executeDeploymentPlan(policy, {
    planName: 'destructive-schema',
    faultAt: 'dump',
  });
  assert.equal(dumpFailure.transition.runtimeAction, 'restore-transaction');

  const markerCreateLoss = executeDeploymentPlan(policy, {
    planName: 'destructive-schema',
    faultAt: 'marker-create',
  });
  assert.deepEqual(markerCreateLoss.transition, {
    runtimeAction: 'stop-writers',
    markerAction: 'preserve',
  });

  const boundaryFaults = [
    'schema-push',
    'schema-push-completed-status',
    'candidate-health',
    'smoke',
    'previous-manifest',
    'current-manifest',
    'history-manifest',
    'bundle',
    'deployed-status',
  ];
  for (const faultAt of boundaryFaults) {
    const result = executeDeploymentPlan(policy, {
      planName: 'destructive-schema',
      faultAt,
    });
    assert.equal(result.transition.runtimeAction, 'stop-writers', faultAt);
    assert.ok(!result.trace.includes('restore-transaction'), faultAt);
  }

  const failedRecoveryWrite = executeDeploymentPlan(policy, {
    planName: 'destructive-schema',
    faultAt: 'current-manifest',
    failRecoveryRequiredWrite: true,
  });
  assert.deepEqual(failedRecoveryWrite.markerOnDisk, {
    status: 'schema-push-completed',
    bytes: 'schema-push-completed-marker',
  });
});

test('application-only fault plan restores compatible runtime and preserves marker bytes', () => {
  const policy = loadPolicy();
  const marker = {
    status: 'deployed',
    bytes: 'exact-deployed-marker-bytes',
  };

  for (const faultAt of [
    'candidate-health',
    'smoke',
    'previous-manifest',
    'current-manifest',
    'history-manifest',
    'bundle',
    'marker-archive',
    'marker-remove',
  ]) {
    const result = executeDeploymentPlan(policy, {
      planName: 'compatible-application-only',
      marker,
      currentManifestIdentity: 'candidate',
      faultAt,
    });
    assert.equal(result.transition.runtimeAction, 'restore-transaction', faultAt);
    assert.deepEqual(result.markerOnDisk, marker, faultAt);
  }

  const success = executeDeploymentPlan(policy, {
    planName: 'compatible-application-only',
    marker,
    currentManifestIdentity: 'candidate',
  });
  assert.equal(success.markerOnDisk, null);
  assert.deepEqual(success.trace.slice(-2), ['marker-archive', 'marker-remove']);
});

test(
  'OS-backed two-process lock model denies contender before mutation and releases without stale-file blocking',
  { skip: process.platform === 'win32' },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'kiditem-office-lock-'));
    const lockPath = join(directory, 'deployment.lock');
    const actionPath = join(directory, 'actions.log');
    try {
      const holder = spawn(
        'python3',
        ['-c', fileLockProbe, lockPath, actionPath, 'holder', 'hold'],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
      await waitForLine(holder.stdout, 'ACQUIRED');

      const contender = spawn(
        'python3',
        [
          '-c',
          fileLockProbe,
          lockPath,
          actionPath,
          'stop/dump/restore/up',
          'once',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const contenderResult = await waitForExit(contender);
      assert.equal(contenderResult.code, 73);
      assert.equal(readFileSync(actionPath, 'utf8'), 'holder\n');

      holder.stdin.end('\n');
      assert.equal((await waitForExit(holder)).code, 0);
      assert.equal(existsSync(lockPath), true, 'released lock file may remain');

      const successor = spawn(
        'python3',
        ['-c', fileLockProbe, lockPath, actionPath, 'successor', 'once'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      assert.equal((await waitForExit(successor)).code, 0);
      assert.equal(readFileSync(actionPath, 'utf8'), 'holder\nsuccessor\n');

      const failingHolder = spawn(
        'python3',
        ['-c', fileLockProbe, lockPath, actionPath, 'failing-holder', 'fail'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      assert.equal((await waitForExit(failingHolder)).code, 74);
      const afterFailure = spawn(
        'python3',
        ['-c', fileLockProbe, lockPath, actionPath, 'after-failure', 'once'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      assert.equal((await waitForExit(afterFailure)).code, 0);
      assert.equal(
        readFileSync(actionPath, 'utf8'),
        'holder\nsuccessor\nfailing-holder\nafter-failure\n',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

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

test('PowerShell atomically preserves schema-push-completed until deployed is the final durable action', () => {
  const script = readFileSync(scriptPath, 'utf8');
  const saveStart = script.indexOf('function Save-RecoveryState {');
  const saveEnd = script.indexOf('\nfunction Save-NewRecoveryState {', saveStart);
  const save = script.slice(saveStart, saveEnd);
  assert.match(save, /\[System\.IO\.File\]::Replace/);
  assert.doesNotMatch(save, /Move-Item[^\n]*-Force/);

  const installStart = script.indexOf('function Install-Deployment {');
  const installEnd = script.indexOf('\nfunction Show-OfficeStatus {', installStart);
  const install = script.slice(installStart, installEnd);
  const deployed = install.indexOf("Set-RecoveryStateStatus 'deployed'");
  const catchStart = install.indexOf('catch {\n    $deploymentError');
  const successLog = install.indexOf('Office deployment complete:');
  const durableActions = [
    '$script:PreviousManifestPath',
    'Set-AtomicTextFile -Path $script:CurrentManifestPath -Text $bundle.Raw',
    '$historyName',
    "Join-Path $archiveRoot 'office-deployment.json'",
    'Copy-Item -LiteralPath $sourceCompose',
    'Copy-Item -LiteralPath $sourceNginx',
    '$fullSuccessTransition.markerAction',
  ];

  for (const token of durableActions) {
    const index = install.lastIndexOf(token, deployed);
    assert.ok(index >= 0 && index < deployed, `${token} must precede deployed`);
  }
  assert.ok(deployed >= 0 && deployed < catchStart);
  assert.ok(successLog > catchStart, 'success logging must be outside deployment catch');
});

test('Status-visible current manifest is written by atomic replace or create', () => {
  const script = readFileSync(scriptPath, 'utf8');
  const atomicStart = script.indexOf('function Set-AtomicTextFile {');
  const atomicEnd = script.indexOf('\nfunction ', atomicStart + 1);
  const atomicWrite = script.slice(atomicStart, atomicEnd);
  assert.match(atomicWrite, /\[System\.IO\.File\]::Replace/);
  assert.match(atomicWrite, /\[System\.IO\.File\]::Move/);

  const installStart = script.indexOf('function Install-Deployment {');
  const installEnd = script.indexOf('\nfunction Show-OfficeStatus {', installStart);
  const install = script.slice(installStart, installEnd);
  assert.match(
    install,
    /Set-AtomicTextFile -Path \$script:CurrentManifestPath -Text \$bundle\.Raw/,
  );
  assert.doesNotMatch(
    install,
    /\$bundle\.Raw \| Set-Content -LiteralPath \$script:CurrentManifestPath/,
  );
});

test('PowerShell holds an exclusive mutation lock around every mutating operation', () => {
  const script = readFileSync(scriptPath, 'utf8');
  const enterStart = script.indexOf('function Enter-DeploymentMutationLock {');
  const enterEnd = script.indexOf('\nfunction Exit-DeploymentMutationLock {', enterStart);
  const enter = script.slice(enterStart, enterEnd);
  assert.match(enter, /\[System\.IO\.File\]::Open/);
  assert.match(enter, /\[System\.IO\.FileShare\]::None/);

  const exitStart = enterEnd + 1;
  const exitEnd = script.indexOf('\nfunction ', exitStart);
  const exit = script.slice(exitStart, exitEnd);
  assert.match(exit, /\.Dispose\(\)/);

  const mainStart = script.indexOf('$head = Assert-LiveCheckout');
  const main = script.slice(mainStart);
  const statusDispatch = main.indexOf("if ($Operation -eq 'Status')");
  const lockAcquire = main.indexOf('$mutationLock = Enter-DeploymentMutationLock');
  const operationGuard = main.indexOf(
    'Assert-OperationAllowedByRecoveryState',
    lockAcquire,
  );
  const operationSwitch = main.indexOf('switch ($Operation)');
  const outerFinally = main.indexOf('finally {');
  const lockRelease = main.indexOf('Exit-DeploymentMutationLock $mutationLock');

  assert.ok(statusDispatch >= 0 && statusDispatch < lockAcquire);
  assert.ok(lockAcquire > statusDispatch && lockAcquire < operationGuard);
  assert.ok(operationGuard < operationSwitch);
  assert.ok(outerFinally > operationSwitch);
  assert.ok(lockRelease > outerFinally);
  assert.doesNotMatch(
    main.slice(lockAcquire, operationGuard),
    /catch\s*{/,
    'lock contention must fail outside deployment recovery handlers',
  );
});

test('PowerShell never restores writers after losing atomic marker creation', () => {
  const script = readFileSync(scriptPath, 'utf8');
  const artifactStart = script.indexOf(
    'function New-DestructiveRecoveryArtifact {',
  );
  const artifactEnd = script.indexOf(
    '\nfunction Get-ContainerState {',
    artifactStart,
  );
  const artifact = script.slice(artifactStart, artifactEnd);
  const installStart = script.indexOf('function Install-Deployment {');
  const installEnd = script.indexOf('\nfunction Show-OfficeStatus {', installStart);
  const install = script.slice(installStart, installEnd);
  const markerAttempted = artifact.indexOf(
    '$RecoveryMarkerCreationAttempted.Value = $true',
  );
  const markerSave = artifact.indexOf('Save-NewRecoveryState $state');
  const catchStart = install.indexOf('catch {\n    $deploymentError');
  const captureTransition = install.indexOf('$captureFailureTransition', catchStart);

  assert.ok(markerAttempted >= 0 && markerAttempted < markerSave);
  assert.match(
    install,
    /-RecoveryMarkerCreationAttempted \(\[ref\]\$recoveryMarkerCreationAttempted\)/,
  );
  assert.ok(captureTransition > catchStart);
  assert.match(
    install.slice(catchStart),
    /\$recoveryMarkerCreationAttempted[\s\S]+\$captureFailureTransition/,
  );
});

test('PowerShell consumes the shared ordered action plans', () => {
  const script = readFileSync(scriptPath, 'utf8');
  assert.match(script, /deploymentActionPlans/);
  assert.match(script, /Assert-NextDeploymentAction/);
  for (const action of [
    'dump',
    'marker-create',
    'schema-push',
    'schema-push-completed-status',
    'candidate-health',
    'smoke',
    'previous-manifest',
    'current-manifest',
    'history-manifest',
    'bundle',
    'deployed-status',
    'marker-archive',
    'marker-remove',
  ]) {
    assert.match(script, new RegExp(`Assert-NextDeploymentAction[^\\n]+${action}`));
  }
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
