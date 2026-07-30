import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();
const remote = readFileSync(
  join(repoRoot, 'deploy/staging/remote-deploy.sh'),
  'utf8',
);

function extractFunction(source, name) {
  const match = source.match(new RegExp(`^${name}\\(\\) \\{([\\s\\S]*?)^\\}`, 'm'));
  assert.ok(match, `missing ${name}()`);
  return match[0];
}

function extractRetireFunction(source) {
  return extractFunction(source, 'retire');
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
});
