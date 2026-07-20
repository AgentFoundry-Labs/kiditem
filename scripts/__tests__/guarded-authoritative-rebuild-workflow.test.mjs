import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();

const environments = [
  {
    name: 'production',
    workflow: '.github/workflows/production-deploy.yml',
    runbook: 'docs/runbooks/production-deploy.md',
    resetToken: 'RESET_PRODUCTION_DATA',
    deployStep: 'Deploy images on production host',
    deployJob: 'Deploy to production',
  },
];

function source(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('guarded authoritative database rebuild workflows', () => {
  it('staging preserves only organizations, users, and memberships before a fresh reset', () => {
    const workflow = source('.github/workflows/staging-deploy.yml');
    const exportPosition = workflow.indexOf('Export staging account baseline');
    const quiescePosition = workflow.indexOf('Quiesce staging application traffic');
    const resetPosition = workflow.indexOf('Rebuild staging database from final schema');
    const restorePosition = workflow.indexOf('Restore staging account baseline');
    const deployPosition = workflow.indexOf('Deploy images on EC2');

    assert.ok(exportPosition >= 0, 'missing staging account-baseline export');
    assert.ok(quiescePosition < exportPosition, 'traffic must stop before the account baseline is sealed');
    assert.ok(exportPosition < resetPosition, 'account baseline must be sealed before the reset boundary');
    assert.ok(resetPosition < restorePosition, 'account baseline must be restored after final schema creation');
    assert.ok(restorePosition < deployPosition, 'the app must start only after account restoration');
    assert.match(workflow, /inventory:rebuild -- export-staging-accounts/);
    assert.match(workflow, /inventory:rebuild -- restore-staging-accounts/);
    assert.match(workflow, /staging-account-baseline\.json/);
    assert.match(workflow, /environment: staging\b/);
    assert.match(workflow, /EXPECTED_RESET_CONFIRMATION: RESET_STAGING_DATA\b/);
    assert.match(workflow, /DATABASE_URL_SHA256/);
    assert.match(workflow, /EXPECTED_DATABASE_NAME/);
    assert.match(
      workflow,
      /u\.pathname\.startsWith\("\/"\) \? u\.pathname\.slice\(1\) : u\.pathname/,
    );
    assert.doesNotMatch(workflow, /baseline-export/);
    assert.doesNotMatch(workflow, /baseline-restore/);
    assert.doesNotMatch(workflow, /data-migration-baseline\.json/);
    assert.match(workflow, /retention-days: 1/);

    for (const forbidden of [
      'finalize-rebuild',
      'STAGING_REBUILD_COUPANG_ACCOUNT_ID',
      'STAGING_REBUILD_COUPANG_EXTERNAL_ACCOUNT_ID',
      'STAGING_REBUILD_SELLPIA_FILE_SHA256',
      'STAGING_REBUILD_WING_FILE_SHA256',
      'inventory:rebuild -- preflight-bootstrap',
      'inventory:rebuild -- export-coupang',
      'inventory:rebuild -- replay-coupang',
      'inventory:rebuild -- verify-ready',
    ]) {
      assert.doesNotMatch(workflow, new RegExp(forbidden));
    }
  });

  it('staging documents that channel accounts and source files are configured after deploy', () => {
    const runbook = source('docs/runbooks/staging-deploy.md');

    assert.match(runbook, /Organization.*User.*OrganizationMembership/s);
    assert.match(runbook, /ChannelAccount.*after.*deploy/is);
    assert.match(runbook, /Sellpia.*WING.*after.*deploy/is);
    assert.doesNotMatch(runbook, /export the selected Coupang account/i);
  });

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

    it(`${environment.name} pins dispatch SHA, database identity, ledger baseline, and image revisions`, () => {
      const workflow = source(environment.workflow);
      assert.match(workflow, /expected_git_sha:\n\s+description:[\s\S]*?required: true/);
      assert.match(workflow, /dispatch_correlation_id:\n\s+description:[\s\S]*?required: true/);
      assert.match(workflow, /^run-name:.*dispatch_correlation_id/m);
      assert.match(workflow, /GITHUB_SHA.*EXPECTED_GIT_SHA|EXPECTED_GIT_SHA.*GITHUB_SHA/);
      assert.match(workflow, /expected_git_sha=\$\{EXPECTED_GIT_SHA\}/);
      assert.match(workflow, /dispatch_correlation_id=\$\{DISPATCH_CORRELATION_ID\}/);
      assert.match(workflow, /DATABASE_URL_SHA256/);
      assert.match(workflow, /EXPECTED_DATABASE_NAME/);
      assert.match(workflow, /current_database\(\)/);
      assert.match(
        workflow,
        /u\.pathname\.startsWith\("\/"\) \? u\.pathname\.slice\(1\) : u\.pathname/,
      );
      assert.doesNotMatch(workflow, /pathname\.replace\(\/\^\\\\\//);
      assert.match(workflow, /baseline-export/);
      assert.match(workflow, /baseline-restore/);
      assert.match(workflow, new RegExp(`${environment.name.toUpperCase()}_REBUILD_SELLPIA_FILE_SHA256`));
      assert.match(workflow, new RegExp(`${environment.name.toUpperCase()}_REBUILD_SELLPIA_ROW_COUNT`));
      assert.match(workflow, new RegExp(`${environment.name.toUpperCase()}_REBUILD_WING_FILE_SHA256`));
      assert.match(workflow, new RegExp(`${environment.name.toUpperCase()}_REBUILD_WING_ROW_COUNT`));
      assert.ok(
        workflow.indexOf('baseline-export') < workflow.indexOf(`Rebuild ${environment.name} database from final schema`),
      );
      assert.ok(
        workflow.indexOf('baseline-restore') > workflow.indexOf(`Rebuild ${environment.name} database from final schema`),
      );
      assert.match(workflow, /apiImageRevision/);
      assert.match(workflow, /webImageRevision/);
    });

    it(`${environment.name} preserves scrape payloads privately and binds finalization to the reset run`, () => {
      const workflow = source(environment.workflow);
      const exportPosition = workflow.indexOf('Export approved Coupang replay bundle');
      const accountPreflightPosition = workflow.indexOf(`Preflight protected ${environment.name} accounts and Supabase auth`);
      const quiescePosition = workflow.indexOf(`Quiesce ${environment.name} application traffic`);
      const resetPosition = workflow.indexOf(`Rebuild ${environment.name} database from final schema`);
      const bootstrapPosition = workflow.indexOf(`Bootstrap ${environment.name} authentication and account baseline`);
      const deployPosition = workflow.indexOf(environment.deployStep);

      assert.ok(exportPosition >= 0, 'missing selective Coupang export');
      assert.ok(accountPreflightPosition >= 0, 'missing protected account/source preflight');
      assert.ok(quiescePosition >= 0, 'missing traffic quiesce');
      assert.ok(accountPreflightPosition < quiescePosition, 'account/source evidence must be sealed before quiesce');
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

    it(`${environment.name} runbook documents the workflow's quiesce-export-artifact-reset order`, () => {
      const runbook = source(environment.runbook);
      const orderStart = runbook.indexOf('The destructive order is:');
      const documentedOrder = runbook.slice(orderStart, orderStart + 600).replace(/\s+/g, ' ');
      const quiescePosition = documentedOrder.indexOf('quiesce application traffic');
      const exportPosition = documentedOrder.indexOf('export the selected Coupang account');
      const artifactPosition = documentedOrder.indexOf('upload the private one-day artifact');
      const resetPosition = documentedOrder.indexOf('cross the reset boundary');

      assert.ok(orderStart >= 0, 'runbook must label the destructive order');
      assert.ok(quiescePosition >= 0, 'runbook must document traffic quiesce');
      assert.ok(exportPosition > quiescePosition, 'runbook must export only after quiesce');
      assert.ok(artifactPosition > exportPosition, 'runbook must upload the artifact after export');
      assert.ok(resetPosition > artifactPosition, 'runbook must reset only after artifact upload');
      assert.doesNotMatch(runbook, /uploaded before traffic is quiesced/i);
      assert.doesNotMatch(runbook, /export\/upload does not finish before traffic quiesce/i);
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
    const exportPosition = architecture.indexOf('export Organization + human User + OrganizationMembership rows');
    const artifactPosition = architecture.indexOf('private workflow artifact');
    const resetPosition = architecture.indexOf('Prisma final schema with --force-reset');

    assert.ok(quiescePosition >= 0 && exportPosition > quiescePosition);
    assert.ok(artifactPosition > exportPosition && resetPosition > artifactPosition);
    assert.match(architecture, /before\s+the reset boundary[\s\S]*resume the previous runtime/i);
    assert.match(architecture, /at or after\s+the\s+reset boundary[\s\S]*must not resume/i);

    for (const name of [
        'REBUILD_EXPECTED_DATABASE_HOST',
        'REBUILD_EXPECTED_SUPABASE_PROJECT_REF',
        'REBUILD_ORGANIZATION_ID',
        'REBUILD_ORGANIZATION_SLUG',
        'REBUILD_COUPANG_ACCOUNT_ID',
        'REBUILD_COUPANG_EXTERNAL_ACCOUNT_ID',
        'REBUILD_EXPECTED_API_ORIGIN',
        'REBUILD_SELLPIA_FILE_SHA256',
        'REBUILD_SELLPIA_ROW_COUNT',
        'REBUILD_WING_FILE_SHA256',
        'REBUILD_WING_ROW_COUNT',
    ]) {
      assert.match(environmentVariables, new RegExp(`PRODUCTION_${name}`));
    }
    assert.match(environmentVariables, /STAGING_DATABASE_URL_SHA256/);
    assert.match(environmentVariables, /STAGING_DATABASE_NAME/);
    assert.doesNotMatch(environmentVariables, /STAGING_REBUILD_COUPANG_ACCOUNT_ID/);
    assert.doesNotMatch(environmentVariables, /STAGING_REBUILD_SELLPIA_FILE_SHA256/);
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
