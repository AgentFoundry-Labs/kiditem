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
    deployJob: 'Deploy to staging',
  },
  {
    name: 'production',
    workflow: '.github/workflows/production-deploy.yml',
    resetToken: 'RESET_PRODUCTION_DATA',
    deployStep: 'Deploy images on production host',
    deployJob: 'Deploy to production',
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
      assert.match(workflow, new RegExp(`${environment.name.toUpperCase()}_REBUILD_EXPECTED_DATABASE_HOST`));
      assert.match(workflow, new RegExp(`${environment.name.toUpperCase()}_REBUILD_EXPECTED_SUPABASE_PROJECT_REF`));
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
      assert.ok(quiescePosition >= 0, 'missing traffic quiesce');
      assert.ok(exportPosition > quiescePosition, 'traffic must quiesce before the private export');
      assert.ok(resetPosition > exportPosition, 'schema rebuild must run after the quiesced export');
      assert.ok(bootstrapPosition > resetPosition, 'baseline bootstrap must follow final schema creation');
      assert.ok(deployPosition > bootstrapPosition, 'the snapshot-required app starts after bootstrap');

      assert.match(workflow, /uses: actions\/upload-artifact@/);
      assert.match(workflow, /retention-days: 1/);
      assert.match(workflow, /rebuild_run_id:/);
      assert.match(workflow, /run-id: \$\{\{ inputs\.rebuild_run_id \}\}/);
      assert.match(workflow, /--origin-run-id "\$\{\{ inputs\.rebuild_run_id \}\}"/);
      assert.match(workflow, /Resolve originating rebuild run/);
      assert.match(workflow, /head_sha/);
      assert.match(workflow, new RegExp(`\.name == "${environment.deployJob}"`));
      assert.match(
        workflow,
        new RegExp(`authoritative-rebuild-\\\$\\\{REBUILD_RUN_ID\\\}-${environment.name}`),
      );
      assert.match(workflow, /ref: \$\{\{ steps\.origin\.outputs\.head_sha \}\}/);
      assert.match(workflow, /REBUILD_DEPLOYED_SHA: \$\{\{ steps\.origin\.outputs\.head_sha \}\}/);
      assert.match(workflow, /REBUILD_EXPECTED_API_ORIGIN:/);
      assert.match(workflow, /POST \/api\/ads\/extension\/sync|inventory:rebuild -- replay-coupang/);
      assert.match(workflow, /inventory:rebuild -- verify-ready/);
      assert.match(
        workflow,
        new RegExp(`deploy/${environment.name}/remote-deploy\\.sh quiesce`),
      );
      assert.match(workflow, /Resume previous .* runtime after pre-reset failure/);
      assert.match(workflow, new RegExp(`deploy/${environment.name}/remote-deploy\\.sh resume`));
      assert.match(workflow, /steps\.reset_boundary\.outputs\.started != 'true'/);
      assert.doesNotMatch(workflow, /Coupang_detailinfo_260711|exported-list \(3\)|exported-list\.xlsx/);
    });
  }

  it('uses the supported remote deploy script to quiesce every application service', () => {
    const remoteDeploy = source('deploy/staging/remote-deploy.sh');
    assert.match(remoteDeploy, /deploy\/staging\/remote-deploy\.sh quiesce/);
    assert.match(remoteDeploy, /compose stop api-blue web-blue worker-blue api-green web-green worker-green/);
    assert.match(remoteDeploy, /quiesce\)\n\s+quiesce/);
    assert.match(remoteDeploy, /resume\)\n\s+resume/);
  });

  it('documents the actual destructive ordering, recovery boundary, and protected values', () => {
    const architecture = source('docs/runbooks/deployment-architecture.md');
    const environmentVariables = source('docs/runbooks/environment-variables.md');
    const quiescePosition = architecture.indexOf('quiesce every API');
    const exportPosition = architecture.indexOf('sanitized Coupang run/snapshot/daily-fact export');
    const artifactPosition = architecture.indexOf('private workflow artifact');
    const resetPosition = architecture.indexOf('Prisma final schema with --force-reset');

    assert.ok(quiescePosition >= 0 && exportPosition > quiescePosition);
    assert.ok(artifactPosition > exportPosition && resetPosition > artifactPosition);
    assert.match(architecture, /before\s+the reset boundary[\s\S]*resume the previous runtime/i);
    assert.match(architecture, /at or after\s+the\s+reset boundary[\s\S]*must not resume/i);

    for (const prefix of ['STAGING', 'PRODUCTION']) {
      for (const name of [
        'REBUILD_EXPECTED_DATABASE_HOST',
        'REBUILD_EXPECTED_SUPABASE_PROJECT_REF',
        'REBUILD_ORGANIZATION_ID',
        'REBUILD_ORGANIZATION_SLUG',
        'REBUILD_COUPANG_ACCOUNT_ID',
        'REBUILD_COUPANG_EXTERNAL_ACCOUNT_ID',
        'REBUILD_EXPECTED_API_ORIGIN',
      ]) {
        assert.match(environmentVariables, new RegExp(`${prefix}_${name}`));
      }
    }
  });

  it('describes retired Sellpia preflight helpers as manual diagnostics, not workflow steps', () => {
    const readme = source('scripts/README.md');
    const preflightLine = readme.split('\n').find((line) =>
      line.includes('scripts/check-sellpia-cutover-preflight.ts')) ?? '';
    const warningLine = readme.split('\n').find((line) =>
      line.includes('scripts/check-sellpia-db-push-warning.mjs')) ?? '';

    assert.match(preflightLine, /manual|operator|diagnostic/i);
    assert.match(warningLine, /manual|operator|diagnostic/i);
    assert.doesNotMatch(`${preflightLine}\n${warningLine}`, /deploy workflows/i);
  });
});
