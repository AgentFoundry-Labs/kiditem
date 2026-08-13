import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, 'utf8');

const functionBody = (source, name) => {
  const start = source.indexOf(`function ${name} {`);
  assert.notEqual(start, -1, `missing PowerShell function ${name}`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(bodyStart + 1, index);
  }

  assert.fail(`unterminated PowerShell function ${name}`);
};

const blockBody = (source, marker) => {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing PowerShell block ${marker}`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) {
      return {
        body: source.slice(bodyStart + 1, index),
        remainder: source.slice(index + 1),
      };
    }
  }

  assert.fail(`unterminated PowerShell block ${marker}`);
};

test('office workflow builds both images and publishes digest refs', () => {
  const workflow = read('.github/workflows/office-images.yml');

  assert.match(workflow, /refs\/heads\/release\/office/);
  assert.equal(
    workflow.match(/uses: \.\/\.github\/workflows\/build-image\.yml/g)?.length,
    2,
  );
  assert.match(workflow, /apiImage: \$apiImage/);
  assert.match(workflow, /webImage: \$webImage/);
  assert.match(workflow, /actions\/upload-artifact@/);
  assert.match(
    workflow,
    /office-deployment-\$\{\{ needs\.identity_guard\.outputs\.git_sha \}\}/,
  );
});

test('office Compose is image-only and preserves external state volumes', () => {
  const compose = read('deploy/office/compose.office.yml');
  const envExample = read('deploy/office/office.env.example');

  assert.doesNotMatch(compose, /^\s*build\s*:/m);
  assert.match(compose, /image: \$\{KIDITEM_API_IMAGE:\?/);
  assert.match(compose, /image: \$\{KIDITEM_WEB_IMAGE:\?/);
  assert.match(compose, /name: kiditem_pgdata/);
  assert.match(compose, /name: kiditem_minio-data/);
  assert.equal(compose.match(/external: true/g)?.length, 2);
  assert.doesNotMatch(compose, /SUPABASE_URL|NEXT_PUBLIC_SUPABASE/);
  assert.doesNotMatch(envExample, /SUPABASE_URL|NEXT_PUBLIC_SUPABASE/);
});

test('office web image build has no Supabase authentication configuration', () => {
  const workflow = read('.github/workflows/office-images.yml');
  assert.doesNotMatch(workflow, /NEXT_PUBLIC_SUPABASE|SUPABASE_URL/);
});

test('office operator guards identity, disk, revision, health, and rollback', () => {
  const script = read('deploy/office/apply-deployment.ps1');

  assert.match(script, /\$branch -ne 'release\/office'/);
  assert.match(script, /\$upstream -ne 'origin\/release\/office'/);
  assert.match(script, /status --porcelain --untracked-files=no/);
  assert.match(script, /ls-remote --heads origin refs\/heads\/release\/office/);
  assert.match(script, /org\.opencontainers\.image\.revision/);
  assert.match(script, /docker image inspect \$Image/);
  assert.match(script, /ConvertFrom-Json -InputObject \$imageJson/);
  assert.doesNotMatch(script, /docker image inspect --format/);
  assert.match(script, /buildx prune --max-used-space 5gb --force/);
  assert.match(script, /Docker\\wsl\\disk\\docker_data\.vhdx/);
  assert.equal(
    script.match(/up --detach --no-build api worker web nginx/g)?.length,
    3,
  );
  assert.doesNotMatch(script, /up -d --no-build/);
  assert.match(script, /'Rollback'/);
  assert.match(script, /merge-base --is-ancestor/);
  assert.match(script, /bundles\\\{0\}/);
  assert.match(script, /\/api\/auth\/me/);
  assert.match(script, /\[switch\]\$ApplySchema/);
  assert.match(script, /\$Operation -ne 'Deploy'/);
  assert.match(script, /\$schemaCommand = 'cd \/app && npx prisma db push'/);
  assert.match(script, /\$schemaCommand = "\$schemaCommand --accept-data-loss"/);
  assert.match(script, /run --rm --no-deps api sh -lc \$schemaCommand/);
  assert.match(script, /stop api worker web nginx/);
  assert.doesNotMatch(script, /docker system prune/);
  assert.doesNotMatch(script, /docker volume prune/);
});

test('destructive Office deploy quiesces writers before recovery capture and schema push', () => {
  const install = functionBody(
    read('deploy/office/apply-deployment.ps1'),
    'Install-Deployment',
  );

  const writerStop = install.indexOf('Stop-ApplicationWriters');
  const recoveryCapture = install.indexOf('New-DestructiveRecoveryArtifact');
  const schemaPush = install.indexOf('npx prisma db push');

  assert.ok(writerStop >= 0, 'destructive deploy must stop application writers');
  assert.ok(
    recoveryCapture > writerStop,
    'recovery capture must occur after application writers stop',
  );
  assert.ok(
    schemaPush > recoveryCapture,
    'schema push must occur after quiesced recovery capture',
  );
});

test('destructive Office recovery artifact is catalog-verified and identity-bound', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const capture = functionBody(script, 'New-DestructiveRecoveryArtifact');

  assert.match(capture, /pg_dump/);
  assert.match(capture, /--format=custom/);
  assert.match(capture, /pg_restore/);
  assert.match(capture, /--list/);
  assert.match(capture, /Get-FileHash[^\n]+SHA256/);
  assert.match(capture, /RecoveryCopyDirectory/);
  assert.match(capture, /copyHash[^\n]+localHash/i);
  assert.match(capture, /priorManifestSha256/);
  assert.match(capture, /priorGitSha/);
  assert.match(capture, /dumpSha256/);
  assert.doesNotMatch(capture, /POSTGRES_PASSWORD|DATABASE_URL/);
});

test('destructive schema boundary failure stops writers without runtime restoration', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const install = functionBody(script, 'Install-Deployment');
  const failureHandler = install.slice(
    install.indexOf('catch {\n    $deploymentError'),
  );
  assert.match(
    failureHandler,
    /if \(\$destructiveBoundaryEntered\)[\s\S]*?\$postBoundaryFailureTransition/,
  );
  const destructiveFailure = blockBody(
    failureHandler,
    "if ($failureTransition.runtimeAction -eq 'stop-writers')",
  );

  assert.match(destructiveFailure.body, /Stop-ApplicationWriters/);
  assert.doesNotMatch(destructiveFailure.body, /Restore-Transaction/);
  assert.match(destructiveFailure.remainder, /throw \$deploymentError/);
});

test('deployment records are finalized inside the destructive failure boundary', () => {
  const install = functionBody(
    read('deploy/office/apply-deployment.ps1'),
    'Install-Deployment',
  );
  const guardedTransaction = blockBody(install, 'try');

  assert.match(guardedTransaction.body, /CurrentManifestPath/);
  assert.match(guardedTransaction.body, /bundles\\\{0\}/);
  assert.match(guardedTransaction.body, /Office deployment complete/);
});

test('destructive Office boundary blocks runtime-only rollback and requires identity-bound recovery', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const completeRecovery = functionBody(script, 'Complete-DatabaseRecovery');

  assert.match(script, /Assert-OperationAllowedByRecoveryState[^\n]+\$Operation/);
  assert.match(script, /'CompleteRecovery'/);
  assert.match(completeRecovery, /RecoveryArtifactPath/);
  assert.match(completeRecovery, /RecoveredDatabaseDumpSha256/);
  assert.match(completeRecovery, /RecoveredPriorManifestPath/);
  assert.match(completeRecovery, /dumpSha256/);
  assert.match(completeRecovery, /priorManifestSha256/);
  assert.match(completeRecovery, /priorGitSha/);
  assert.match(completeRecovery, /Remove-Item[^\n]+RecoveryStatePath/);
});

test('application-only Office deploy failures retain automatic runtime restoration', () => {
  const install = functionBody(
    read('deploy/office/apply-deployment.ps1'),
    'Install-Deployment',
  );
  const failureHandler = install.slice(
    install.indexOf('catch {\n    $deploymentError'),
  );
  assert.match(
    failureHandler,
    /else[\s\S]*?\$preBoundaryFailureTransition/,
  );
  const applicationFailure = blockBody(
    failureHandler,
    "elseif ($failureTransition.runtimeAction -eq 'restore-transaction')",
  );

  assert.match(applicationFailure.body, /Restore-Transaction \$backupRoot/);
});

test('office API runtime includes the Prisma CLI used by explicit schema apply', () => {
  const serverPackage = JSON.parse(read('apps/server/package.json'));
  assert.equal(typeof serverPackage.dependencies.prisma, 'string');
  assert.equal(serverPackage.devDependencies?.prisma, undefined);
});

test(
  'office operator forwards detach and parses revision under Windows PowerShell',
  { skip: process.platform !== 'win32' },
  () => {
    const probe = String.raw`
. '.\deploy\office\apply-deployment.ps1'
$script:capturedArgs = @()
$script:fakeRevision = 'a' * 40
function docker {
  $script:capturedArgs = @($args)
  if ($args.Count -ge 3 -and $args[0] -eq 'image' -and $args[1] -eq 'inspect') {
    [pscustomobject]@{
      Config = [pscustomobject]@{
        Labels = [pscustomobject]@{
          'org.opencontainers.image.revision' = $script:fakeRevision
        }
      }
    } | ConvertTo-Json -Depth 4
  }
  $global:LASTEXITCODE = 0
}
Invoke-Checked docker compose up --detach --no-build api worker web nginx
if ($script:capturedArgs -notcontains '--detach') {
  throw 'Invoke-Checked did not forward --detach.'
}
Assert-ImageRevision 'example.invalid/kiditem-api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' $script:fakeRevision
`;
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', probe],
      { cwd: root, encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
  },
);

test('office runbook fixes branch lifetime and rollback boundaries', () => {
  const runbook = read('docs/runbooks/office-deploy.md');

  assert.match(runbook, /persistent\s+environment branch/);
  assert.match(runbook, /protected against deletion/);
  assert.match(runbook, /current\.json/);
  assert.match(runbook, /previous\.json/);
  assert.match(runbook, /never runs `docker system prune`/);
  assert.match(runbook, /larger local SSD/);
  assert.match(runbook, /-ApplySchema/);
  assert.match(runbook, /does not undo Prisma schema changes/);
});
