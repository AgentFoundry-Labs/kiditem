import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();

const environments = [
  {
    name: 'staging',
    workflow: '.github/workflows/staging-deploy.yml',
    resetToken: 'RESET_STAGING_DATA',
    deployStep: 'Deploy images on EC2',
  },
  {
    name: 'production',
    workflow: '.github/workflows/production-deploy.yml',
    resetToken: 'RESET_PRODUCTION_DATA',
    deployStep: 'Deploy images on production host',
  },
];

function source(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('guarded authoritative database rebuild workflows', () => {
  for (const environment of environments) {
    it(`${environment.name} binds both rebuild phases to its GitHub Environment and exact reset token`, () => {
      const workflow = source(environment.workflow);

      assert.match(workflow, /deployment_target:\n\s+description:/);
      assert.match(workflow, /destructive_reset:\n\s+description:/);
      assert.match(workflow, new RegExp(`environment: ${environment.name}\\b`));
      assert.match(
        workflow,
        new RegExp(`EXPECTED_RESET_CONFIRMATION: ${environment.resetToken}\\b`),
      );
      assert.match(workflow, /DEPLOYMENT_TARGET: \$\{\{ inputs\.deployment_target \}\}/);
      assert.match(workflow, new RegExp(`GITHUB_ENVIRONMENT: ${environment.name}\\b`));
      assert.match(workflow, /npm run inventory:rebuild -- guard/);
      assert.match(workflow, /inputs\.operation == 'finalize-rebuild'/);
    });

    it(`${environment.name} preserves scrape payloads privately and binds finalization to the reset run`, () => {
      const workflow = source(environment.workflow);
      const exportPosition = workflow.indexOf('Export approved Coupang replay bundle');
      const quiescePosition = workflow.indexOf(`Quiesce ${environment.name} application traffic`);
      const resetPosition = workflow.indexOf(`Rebuild ${environment.name} database from final schema`);
      const bootstrapPosition = workflow.indexOf(`Bootstrap ${environment.name} authentication and account baseline`);
      const deployPosition = workflow.indexOf(environment.deployStep);

      assert.ok(exportPosition >= 0, 'missing selective Coupang export');
      assert.ok(quiescePosition > exportPosition, 'traffic must quiesce after the private export');
      assert.ok(resetPosition > quiescePosition, 'schema rebuild must run after traffic is quiesced');
      assert.ok(bootstrapPosition > resetPosition, 'baseline bootstrap must follow final schema creation');
      assert.ok(deployPosition > bootstrapPosition, 'the snapshot-required app starts after bootstrap');

      assert.match(workflow, /uses: actions\/upload-artifact@/);
      assert.match(workflow, /retention-days: 1/);
      assert.match(workflow, /rebuild_run_id:/);
      assert.match(workflow, /run-id: \$\{\{ inputs\.rebuild_run_id \}\}/);
      assert.match(workflow, /--origin-run-id "\$\{\{ inputs\.rebuild_run_id \}\}"/);
      assert.match(workflow, /POST \/api\/ads\/extension\/sync|inventory:rebuild -- replay-coupang/);
      assert.match(workflow, /inventory:rebuild -- verify-ready/);
      assert.match(
        workflow,
        new RegExp(`deploy/${environment.name}/remote-deploy\\.sh quiesce`),
      );
      assert.doesNotMatch(workflow, /Coupang_detailinfo_260711|exported-list \(3\)|exported-list\.xlsx/);
    });
  }

  it('uses the supported remote deploy script to quiesce every application service', () => {
    const remoteDeploy = source('deploy/staging/remote-deploy.sh');
    assert.match(remoteDeploy, /deploy\/staging\/remote-deploy\.sh quiesce/);
    assert.match(remoteDeploy, /compose stop api-blue web-blue worker-blue api-green web-green worker-green/);
    assert.match(remoteDeploy, /quiesce\)\n\s+quiesce/);
  });
});
