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
  if (scenario.markerStatus === 'invalid' || scenario.markerStatus === 'v1') {
    return false;
  }
  if (scenario.applySchema && scenario.operation !== 'Deploy') {
    return false;
  }
  if (
    scenario.acceptDataLoss &&
    (scenario.operation !== 'Deploy' || !scenario.applySchema)
  ) {
    return false;
  }
  if (scenario.markerStatus === 'none') {
    return true;
  }
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

const deploymentKindByPlan = Object.freeze({
  'application-only': 'application-only',
  'compatible-application-only': 'application-only',
  schema: 'schema',
  'destructive-schema': 'schema',
});

const destructiveBoundaryByPlan = Object.freeze({
  'application-only': false,
  'compatible-application-only': false,
  schema: false,
  'destructive-schema': true,
});

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
  const deploymentKind = deploymentKindByPlan[planName];
  assert.ok(deploymentKind, `missing deployment kind for ${planName}`);
  assert.equal(
    typeof destructiveBoundaryByPlan[planName],
    'boolean',
    `missing destructive classification for ${planName}`,
  );

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
    const failureTrace = [transition.runtimeAction];
    trace.push(transition.runtimeAction);
    if (transition.markerAction === 'require-recovery') {
      trace.push('recovery-required-status');
      failureTrace.push('recovery-required-status');
      if (failRecoveryRequiredWrite) {
        trace.push('recovery-required-status-failed');
        failureTrace.push('recovery-required-status-failed');
      } else if (markerOnDisk) {
        markerOnDisk.status = 'recovery-required';
        markerOnDisk.bytes = 'recovery-required-marker';
      }
    }
    return { trace, failureTrace, markerOnDisk, transition };
  };

  for (const action of plan) {
    trace.push(action);
    if (
      action === 'schema-push' &&
      destructiveBoundaryByPlan[planName]
    ) {
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

  return { trace, failureTrace: [], markerOnDisk, transition: null };
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

test('operation contract covers the full recovery-state Cartesian matrix', () => {
  const policy = loadPolicy();
  const states = [
    'none',
    'prepared',
    'schema-push-completed',
    'recovery-required',
    'deployed',
    'invalid',
    'v1',
  ];
  const operations = ['Status', 'Deploy', 'Rollback', 'CompleteRecovery'];
  const identities = ['none', 'candidate', 'not-candidate'];
  const scenarios = [];

  for (const markerStatus of states) {
    for (const operation of operations) {
      for (const applySchema of [false, true]) {
        for (const currentManifestIdentity of identities) {
          const dataLossVariants =
            operation === 'Deploy' && applySchema ? [false, true] : [false];
          for (const acceptDataLoss of dataLossVariants) {
            scenarios.push({
              markerStatus,
              operation,
              applySchema,
              acceptDataLoss,
              currentManifestIdentity,
            });
          }
        }
      }
    }
  }

  assert.equal(scenarios.length, 189, 'Cartesian matrix coverage drifted');
  const expectedAllowed = (scenario) => {
    if (scenario.markerStatus === 'invalid' || scenario.markerStatus === 'v1') {
      return false;
    }
    if (scenario.applySchema && scenario.operation !== 'Deploy') {
      return false;
    }
    if (scenario.markerStatus === 'none') {
      return true;
    }
    if (
      (scenario.operation === 'Status' ||
        scenario.operation === 'CompleteRecovery') &&
      !scenario.applySchema
    ) {
      return true;
    }
    return (
      scenario.markerStatus === 'deployed' &&
      scenario.operation === 'Deploy' &&
      !scenario.applySchema &&
      scenario.currentManifestIdentity === 'candidate'
    );
  };

  for (const scenario of scenarios) {
    assert.equal(
      operationAllowed(policy, scenario),
      expectedAllowed(scenario),
      JSON.stringify(scenario),
    );
  }
});

test('fault harness uses an explicit policy-plan classification', () => {
  const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.doesNotMatch(source, /planName\.startsWith\(/);
  assert.match(source, /const deploymentKindByPlan = Object\.freeze/);
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

test('fault harness executes every action in every shared deployment plan', () => {
  const policy = loadPolicy();
  const compatibleMarker = {
    status: 'deployed',
    bytes: 'exact-deployed-marker-bytes',
  };
  const fixtures = {
    'application-only': {
      marker: null,
      identity: 'none',
    },
    'compatible-application-only': {
      marker: compatibleMarker,
      identity: 'candidate',
    },
    schema: {
      marker: null,
      identity: 'none',
    },
    'destructive-schema': {
      marker: null,
      identity: 'none',
    },
  };
  const exercised = [];

  assert.deepEqual(Object.keys(policy.deploymentActionPlans).sort(), [
    'application-only',
    'compatible-application-only',
    'destructive-schema',
    'schema',
  ]);

  for (const [planName, plan] of Object.entries(policy.deploymentActionPlans)) {
    const fixture = fixtures[planName];
    assert.ok(fixture, `missing fault fixture for ${planName}`);
    for (const faultAt of plan) {
      exercised.push(`${planName}:${faultAt}`);
      const result = executeDeploymentPlan(policy, {
        planName,
        marker: fixture.marker,
        currentManifestIdentity: fixture.identity,
        faultAt,
      });
      assert.ok(result.trace.includes(faultAt), `${planName}:${faultAt}`);

      if (planName === 'destructive-schema' && faultAt === 'marker-create') {
        assert.deepEqual(
          result.transition,
          { runtimeAction: 'stop-writers', markerAction: 'preserve' },
          `${planName}:${faultAt}`,
        );
      } else if (
        planName === 'destructive-schema' &&
        plan.indexOf(faultAt) > plan.indexOf('marker-create')
      ) {
        assert.deepEqual(
          result.transition,
          { runtimeAction: 'stop-writers', markerAction: 'require-recovery' },
          `${planName}:${faultAt}`,
        );
      } else {
        assert.deepEqual(
          result.transition,
          { runtimeAction: 'restore-transaction', markerAction: 'preserve' },
          `${planName}:${faultAt}`,
        );
      }

      if (planName === 'compatible-application-only') {
        assert.deepEqual(
          result.markerOnDisk,
          compatibleMarker,
          `${planName}:${faultAt}`,
        );
      }
    }
  }

  assert.equal(exercised.length, 56, 'shared action-plan coverage drifted');
  assert.deepEqual(
    new Set(exercised).size,
    exercised.length,
    'every plan/action fault case must be unique',
  );

  const compatibleSuccess = executeDeploymentPlan(policy, {
    planName: 'compatible-application-only',
    marker: compatibleMarker,
    currentManifestIdentity: 'candidate',
  });
  assert.equal(compatibleSuccess.markerOnDisk, null);
  assert.deepEqual(
    compatibleSuccess.trace.slice(-2),
    ['marker-archive', 'marker-remove'],
  );
});

test('every post-marker destructive fault models successful and failed recovery persistence', () => {
  const policy = loadPolicy();
  const plan = policy.deploymentActionPlans['destructive-schema'];
  const markerCreateIndex = plan.indexOf('marker-create');
  const schemaStatusIndex = plan.indexOf('schema-push-completed-status');
  assert.ok(markerCreateIndex >= 0 && schemaStatusIndex > markerCreateIndex);

  for (const faultAt of plan.slice(markerCreateIndex + 1)) {
    const faultIndex = plan.indexOf(faultAt);
    const priorMarker =
      faultIndex <= schemaStatusIndex
        ? { status: 'prepared', bytes: 'prepared-marker' }
        : {
            status: 'schema-push-completed',
            bytes: 'schema-push-completed-marker',
          };
    const persisted = executeDeploymentPlan(policy, {
      planName: 'destructive-schema',
      faultAt,
      failRecoveryRequiredWrite: false,
    });
    assert.equal(persisted.markerOnDisk.status, 'recovery-required', faultAt);
    assert.deepEqual(
      persisted.failureTrace,
      ['stop-writers', 'recovery-required-status'],
      faultAt,
    );

    const writeFailed = executeDeploymentPlan(policy, {
      planName: 'destructive-schema',
      faultAt,
      failRecoveryRequiredWrite: true,
    });
    assert.deepEqual(writeFailed.markerOnDisk, priorMarker, faultAt);
    assert.deepEqual(
      writeFailed.failureTrace,
      [
        'stop-writers',
        'recovery-required-status',
        'recovery-required-status-failed',
      ],
      faultAt,
    );
    assert.ok(!writeFailed.failureTrace.includes('restore-transaction'), faultAt);
    assert.ok(!writeFailed.failureTrace.includes('start-application'), faultAt);
  }
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
    'Set-AtomicTextFile -Path $script:CurrentManifestPath -Text $bundle.Raw',
  );
  const markerArchive = install.indexOf(
    "Archive-RecoveryState 'superseded-by-compatible-forward-deploy'",
  );
  const markerRemove = install.indexOf(
    'Remove-Item -LiteralPath $script:RecoveryStatePath',
  );

  assert.ok(operationGuard >= 0 && operationGuard < firstMutationGuard);
  assert.ok(currentManifestWrite >= 0, 'current manifest write must be located');
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
  const deployedSuffix = install.slice(
    deployed + "Set-RecoveryStateStatus 'deployed'".length,
    catchStart,
  );
  assert.match(deployedSuffix, /^\s*\}\s*\}\s*$/);
  assert.doesNotMatch(
    deployedSuffix,
    /Set-|Copy-|Move-|Remove-|New-|Invoke-|Wait-|Assert-|Archive-|docker|Write-DeployEnv|Restore-Transaction|Stop-ApplicationWriters/,
  );
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
