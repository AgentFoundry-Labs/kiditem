import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
