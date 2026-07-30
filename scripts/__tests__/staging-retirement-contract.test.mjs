import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();
const remote = readFileSync(
  join(repoRoot, 'deploy/staging/remote-deploy.sh'),
  'utf8',
);
const workflow = readFileSync(
  join(repoRoot, '.github/workflows/staging-deploy.yml'),
  'utf8',
);
const productionWrapper = readFileSync(
  join(repoRoot, 'deploy/production/remote-deploy.sh'),
  'utf8',
);

function source(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function extractFunction(source, name) {
  const match = source.match(new RegExp(`^${name}\\(\\) \\{([\\s\\S]*?)^\\}`, 'm'));
  assert.ok(match, `missing ${name}()`);
  return match[0];
}

function extractRetireFunction(source) {
  return extractFunction(source, 'retire');
}

function extractWorkflowJob(source, name) {
  const start = source.indexOf(`  ${name}:\n`);
  assert.ok(start >= 0, `missing ${name} workflow job`);

  const following = source.slice(start + 1);
  const nextJobOffset = following.search(/^  [a-z_]+:\n/m);
  return nextJobOffset < 0
    ? source.slice(start)
    : source.slice(start, start + 1 + nextJobOffset);
}

describe('staging retirement remote-script contract', () => {
  it('persists a staging-only retirement lock and blocks deploys while it exists', () => {
    assert.match(remote, /RETIREMENT_LOCK_FILE=.*retired\.json/);
    assert.match(remote, /ALLOW_STAGING_RETIRE.*RETIRE_STAGING/);
    assert.match(remote, /deploy\(\)[\s\S]*assert_not_retired/);

    const stagingGate = extractFunction(
      remote,
      'require_staging_retirement_operation',
    );
    assert.match(stagingGate, /DEPLOY_ENVIRONMENT.*staging/);

    const deploy = extractFunction(remote, 'deploy');
    assert.ok(
      deploy.indexOf('cd "$APP_DIR"') < deploy.indexOf('assert_not_retired'),
      'deploy must resolve a relative retirement marker from APP_DIR',
    );
    assert.ok(
      deploy.indexOf('assert_not_retired') < deploy.indexOf('docker_login_if_available'),
      'deploy must check retirement before Docker login',
    );
  });

  it('retires only staging after recording non-secret operation evidence', () => {
    const retire = extractRetireFunction(remote);
    const markerWriter = extractFunction(remote, 'write_retirement_marker');

    assert.match(remote, /compose stop api-blue web-blue worker-blue api-green web-green worker-green nginx/);
    assert.match(retire, /require_staging_retirement_operation/);
    assert.match(retire, /ALLOW_STAGING_RETIRE.*RETIRE_STAGING/);
    assert.match(markerWriter, /GITHUB_RUN_ID/);
    assert.match(markerWriter, /GIT_SHA/);
    assert.match(markerWriter, /GITHUB_SHA/);
    assert.match(markerWriter, /DISPATCH_CORRELATION_ID/);
    assert.doesNotMatch(markerWriter, /GHCR_TOKEN|password|secret/i);
    assert.doesNotMatch(retire, /assert_not_retired/);
    assert.match(
      retire,
      /if \[\[ -f "\$RETIREMENT_LOCK_FILE" \]\]; then\s+echo "Staging is already retired; preserving existing marker:"\s+cat "\$RETIREMENT_LOCK_FILE"\s+else\s+write_retirement_marker\s+fi/s,
    );
    assert.ok(
      retire.indexOf('write_retirement_marker') < retire.indexOf('compose stop'),
      'retirement marker must be written before services stop',
    );
    assert.ok(
      retire.indexOf('if [[ -f "$RETIREMENT_LOCK_FILE" ]]') < retire.indexOf('compose stop'),
      'retrying retirement must still stop the exact services after showing the marker',
    );
    assert.doesNotMatch(extractRetireFunction(remote), /compose down|docker volume|rm -rf/);
  });

  it('restores the retired staging runtime before clearing its retirement lock', () => {
    const restore = extractFunction(remote, 'restore');

    assert.match(remote, /ALLOW_STAGING_RESTORE.*RESUME_RETIRED_STAGING/);
    assert.match(restore, /require_staging_retirement_operation/);
    assert.match(restore, /ALLOW_STAGING_RESTORE.*RESUME_RETIRED_STAGING/);
    assert.match(restore, /RETIREMENT_LOCK_FILE/);
    assert.ok(
      restore.indexOf('resume') < restore.indexOf('rm -f "$RETIREMENT_LOCK_FILE"'),
      'restore must resume and pass health checks before removing the marker',
    );
  });

  it('exposes retirement evidence through status and command dispatch', () => {
    const status = extractFunction(remote, 'status');

    assert.match(status, /RETIREMENT_LOCK_FILE/);
    assert.match(status, /not retired/);
    assert.match(remote, /retire\)\n\s+retire/);
    assert.match(remote, /restore\)\n\s+restore/);
  });

  it('provides a guarded workflow operator for retirement without deploy work', () => {
    assert.match(workflow, /- retire/);
    assert.match(workflow, /- restore/);
    assert.match(workflow, /retirement_confirmation/);
    assert.match(workflow, /deploy\/staging\/remote-deploy\.sh retire/);
    assert.match(workflow, /deploy\/staging\/remote-deploy\.sh restore/);

    const retirement = extractWorkflowJob(workflow, 'retirement');
    assert.match(retirement, /inputs\.operation == 'retire' \|\| inputs\.operation == 'restore'/);
    assert.match(retirement, /needs: identity_guard/);
    assert.match(retirement, /environment: staging\b/);
    assert.match(retirement, /ref: \$\{\{ needs\.identity_guard\.outputs\.git_sha \}\}/);
    assert.match(retirement, /ALLOW_STAGING_RETIRE/);
    assert.match(retirement, /ALLOW_STAGING_RESTORE/);
    assert.match(retirement, /retirement_confirmation/);
    assert.match(retirement, /remote-deploy\.sh status/);
    assert.match(retirement, /STAGING_URL/);
    assert.match(retirement, /\/login/);
    assert.match(retirement, /== "200"/);
    assert.doesNotMatch(retirement, /npm ci|docker pull|prisma|db push|git tag/i);
  });

  it('blocks every deploy data mutation behind an anchored remote retirement check', () => {
    const deploy = extractWorkflowJob(workflow, 'deploy');
    const sshPreparation = deploy.indexOf('- name: Prepare SSH for retirement guard');
    const retirementGuard = deploy.indexOf('- name: Refuse deployment while staging is retired');

    assert.ok(sshPreparation >= 0, 'deploy must prepare SSH for the retirement guard');
    assert.ok(
      sshPreparation < retirementGuard,
      'deploy must prepare SSH before checking the retirement marker',
    );
    const preSchemaMigration = deploy.indexOf(
      '- name: Run pre-schema data migrations',
    );
    assert.doesNotMatch(
      deploy.slice(sshPreparation, retirementGuard),
      /^\s+if:/m,
      'SSH preparation must cover normal and destructive deploys',
    );
    assert.doesNotMatch(
      deploy.slice(retirementGuard, preSchemaMigration),
      /^\s+if:/m,
      'retirement guard must cover normal and destructive deploys',
    );
    assert.match(
      deploy.slice(retirementGuard),
      /STAGING_REMOTE_DIR="\$\{STAGING_REMOTE_DIR:-\/opt\/kiditem\}"[\s\S]*\$\{STAGING_REMOTE_DIR\}\/deployments\/retired\.json/,
    );

    for (const mutation of [
      'npm run data:migrate -- up --phase pre-schema',
      'npx prisma db push --force-reset',
      'npx prisma db push',
      'npm run inventory:rebuild -- restore-staging-accounts',
      'npm run data:migrate -- up --phase post-schema',
      'npm run seed:order-collection-malls',
    ]) {
      const mutationPosition = deploy.indexOf(mutation);
      assert.ok(mutationPosition >= 0, `missing deploy mutation: ${mutation}`);
      assert.ok(
        retirementGuard < mutationPosition,
        `retirement guard must precede deploy mutation: ${mutation}`,
      );
    }
  });

  it('forces production environment and rejects retirement commands before dispatch', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'kiditem-production-wrapper-'));
    const productionDir = join(fixture, 'deploy/production');
    const stagingDir = join(fixture, 'deploy/staging');
    mkdirSync(productionDir, { recursive: true });
    mkdirSync(stagingDir, { recursive: true });

    const wrapperPath = join(productionDir, 'remote-deploy.sh');
    const delegatePath = join(stagingDir, 'remote-deploy.sh');
    writeFileSync(wrapperPath, productionWrapper);
    writeFileSync(
      delegatePath,
      '#!/usr/bin/env bash\nprintf \'%s:%s\\n\' "$DEPLOY_ENVIRONMENT" "$1"\n',
    );
    chmodSync(wrapperPath, 0o755);
    chmodSync(delegatePath, 0o755);

    try {
      const deployResult = spawnSync(wrapperPath, ['deploy'], {
        cwd: fixture,
        encoding: 'utf8',
        env: { ...process.env, DEPLOY_ENVIRONMENT: 'staging' },
      });
      assert.equal(deployResult.status, 0, deployResult.stderr);
      assert.equal(deployResult.stdout.trim(), 'production:deploy');

      for (const operation of ['retire', 'restore']) {
        const result = spawnSync(wrapperPath, [operation], {
          cwd: fixture,
          encoding: 'utf8',
          env: { ...process.env, DEPLOY_ENVIRONMENT: 'staging' },
        });
        assert.notEqual(result.status, 0, `${operation} must be rejected`);
        assert.equal(result.stdout, '', `${operation} must not reach the delegate`);
        assert.match(result.stderr, /production.*retire|retire.*production/i);
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('syncs every asset required to restore retired staging', () => {
    const retirement = extractWorkflowJob(workflow, 'retirement');
    assert.match(
      retirement,
      /tar -czf - docker-compose\.staging\.yml deploy\/staging\/nginx\.conf deploy\/staging\/remote-deploy\.sh/,
    );
  });

  it('collects retirement evidence after an attempted remote control operation', () => {
    const retirement = extractWorkflowJob(workflow, 'retirement');
    assert.match(
      retirement,
      /- name: Run selected staging retirement operation\s+id: remote_control/,
    );

    assert.match(
      retirement,
      /- name: Query final EC2 status\s+if: always\(\) && \(steps\.remote_control\.outcome == 'success' \|\| steps\.remote_control\.outcome == 'failure'\)/,
    );
    assert.match(
      retirement,
      /- name: Verify retirement public boundary\s+if: always\(\) && \(steps\.remote_control\.outcome == 'success' \|\| steps\.remote_control\.outcome == 'failure'\) && inputs\.operation == 'retire'/,
    );
    assert.match(
      retirement,
      /- name: Verify restored public staging URL\s+if: always\(\) && \(steps\.remote_control\.outcome == 'success' \|\| steps\.remote_control\.outcome == 'failure'\) && inputs\.operation == 'restore'/,
    );
  });

  it('documents retirement evidence, confirmations, and retained infrastructure', () => {
    for (const relativePath of [
      'docs/runbooks/staging-deploy.md',
      'docs/runbooks/deployment-architecture.md',
      'tools/codex/skills/staging-deploy-operator/SKILL.md',
    ]) {
      const document = source(relativePath);
      assert.match(document, /deployments\/retired\.json/);
      assert.match(document, /RETIRE_STAGING/);
      assert.match(document, /RESUME_RETIRED_STAGING/);
      assert.match(document, /operation=status/);
      assert.match(document, /no\s+data\s+deletion|without deleting.*data/i);
    }
  });
});
