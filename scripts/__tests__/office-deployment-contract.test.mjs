import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { parseOfficeDeployArgs, powershellArgs } from '../office-deploy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('package exposes the three simplified Office commands', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts['deploy:office:local'], 'node scripts/office-deploy.mjs deploy');
  assert.equal(scripts['deploy:office:status'], 'node scripts/office-deploy.mjs status');
  assert.equal(scripts['deploy:office:rollback'], 'node scripts/office-deploy.mjs rollback');
});

test('Office CLI admits only named origin branches and explicit schema/data cutover', () => {
  assert.deepEqual(parseOfficeDeployArgs(['deploy', '--ref', 'origin/release/office']), {
    operation: 'deploy',
    sourceRef: 'origin/release/office',
    schemaDataCutover: false,
    confirmation: undefined,
    pruneBuildCache: false,
  });
  assert.equal(
    parseOfficeDeployArgs([
      'deploy', '--ref', 'origin/release/office', '--cutover', '--confirm', 'APPLY_SCHEMA_DATA',
    ]).schemaDataCutover,
    true,
  );
  for (const ref of ['develop', 'HEAD', 'origin/../main', 'upstream/develop', 'origin/develop/']) {
    assert.throws(() => parseOfficeDeployArgs(['deploy', '--ref', ref]));
  }
  assert.throws(() => parseOfficeDeployArgs(['deploy', '--ref', 'origin/develop', '--cutover']));
  assert.throws(() => parseOfficeDeployArgs(['status', '--ref', 'origin/develop']));
});

test('Windows native fixture avoids PowerShell PID collisions', () => {
  const nativeFixture = read('scripts/__tests__/office-windows-native-runtime.fixture.ps1');
  assert.doesNotMatch(nativeFixture, /\b\d+_\d+\b/);
  assert.doesNotMatch(nativeFixture, /foreach\s*\(\s*\$pid\s+in/i);
});

test('CLI delegates to the checked-in PowerShell operator without passing secrets', () => {
  const args = powershellArgs(
    parseOfficeDeployArgs(['deploy', '--ref', 'origin/release/office']),
    'C:\\repo',
  );
  assert.ok(args.includes('-SourceRef'));
  assert.ok(args.includes('origin/release/office'));
  assert.ok(args.includes('-InvokerRepoRoot'));
  assert.doesNotMatch(args.join(' '), /password|token|database_url/i);
});

test('GitHub Office bundle, GHCR image publisher, and promotion artifact gate are removed', () => {
  for (const path of [
    '.github/workflows/office-images.yml',
    '.github/workflows/develop-gateway-package.yml',
    '.github/workflows/build-image.yml',
    'deploy/office/digest.env.example',
  ]) {
    assert.equal(existsSync(join(root, path)), false, `${path} must be removed`);
  }
  const prChecks = read('.github/workflows/pr-checks.yml');
  assert.doesNotMatch(prChecks, /develop_artifact_gate|develop-gateway-package|gh api/);
  assert.match(prChecks, /Gateway fast checks/);
});

test('local deploy fetches a remote branch and builds an exact clean detached worktree', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  assert.match(script, /status --porcelain --untracked-files=all/);
  assert.match(script, /fetch --no-tags origin/);
  assert.match(script, /ls-remote --heads origin/);
  assert.match(script, /worktree add --detach/);
  assert.match(script, /git -c core\.longpaths=true -C \$CheckoutRoot worktree remove --force/);
  assert.match(script, /Fetched remote-tracking SHA does not match/);
  assert.match(script, /Temporary Office source worktree is not the exact clean fetched SHA/);
  assert.match(script, /ls-remote --heads origin/);
});

test('final release requires live checkout alignment and status reports provisional drift', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  assert.match(script, /function Get-AuthoritativeRemoteReleaseSha/);
  assert.match(script, /Final Office release requires the clean live release\/office checkout/);
  assert.match(script, /Provisional Office incident deployment/);
  assert.match(script, /Office runtime is provisional/);
});

test('API, web, and Windows Gateway are built locally with one VERSION and Git SHA', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const gatewayBuild = read('deploy/office/gateway-build.ps1');
  assert.match(script, /docker build/);
  assert.match(script, /kiditem-api:office-\$GitSha/);
  assert.match(script, /kiditem-web:office-\$GitSha/);
  assert.match(script, /org\.opencontainers\.image\.revision=\$GitSha/);
  assert.match(script, /org\.opencontainers\.image\.version=\$AppVersion/);
  assert.match(script, /Assert-LocalImageIdentity/);
  assert.doesNotMatch(script, /Invoke-Checked docker pull/);
  assert.match(script, /gateway-build\.ps1/);
  assert.match(gatewayBuild, /Invoke-Checked -Program \$dotnet -Arguments @\(/);
  assert.match(gatewayBuild, /Invoke-Checked -Program node\.exe -Arguments @\([\s\S]*'-e'/);
  assert.match(gatewayBuild, /'publish',[\s\S]*'apps\/agent-gateway\/windows\/KidItem\.JobRunner\/KidItem\.JobRunner\.csproj'/);
  assert.match(gatewayBuild, /'-o', \$nativeRoot/);
  assert.match(gatewayBuild, /npm\.cmd pack --workspace=apps\/agent-gateway --ignore-scripts/);
  assert.match(script, /release-identity\.json/);
  assert.match(script, /Gateway release VERSION\/Git SHA identity/);
  assert.doesNotMatch(`${script}\n${gatewayBuild}`, /cliContractIdentity/);
});

test('API image installs cap npm registry concurrency for WSL network stability', () => {
  const dockerfile = read('apps/server/Dockerfile');
  assert.equal(dockerfile.match(/--maxsockets=4/g)?.length, 2);
});

test('Gateway payload reuse is scoped to explicit build inputs and hash-verified archives', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const gatewayBuild = read('deploy/office/gateway-build.ps1');
  for (const path of [
    'package.json',
    'package-lock.json',
    '.npmrc',
    'tsconfig.json',
    'prisma',
    'prisma.config.ts',
    'packages/shared',
    'apps/agent-gateway',
    'deploy/office/gateway-build.ps1',
  ]) {
    assert.match(script, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(script, /git -C \$CheckoutRoot diff --name-only --diff-filter=ACDMRTUXB/);
  assert.match(script, /Get-ArchivedGatewayArtifact \$SourceManifest/);
  assert.match(script, /Assert-GatewayArtifact \$artifact \$Manifest/);
  assert.match(script, /Gateway payload reused from archived SHA/);
  assert.match(script, /running exact-SHA full build before live mutation/);
  assert.match(script, /Join-Path \$WorktreePath 'deploy\\office\\gateway-build\.ps1'/);
  assert.match(script, /Build-ExactShaGatewayPayload/);
  assert.match(gatewayBuild, /npm\.cmd ci --no-audit --no-fund/);
  assert.doesNotMatch(script, /npm\.cmd ci --no-audit --no-fund/);
  assert.deepEqual(
    [...script.matchAll(/^\s+'(agent-gateway\.tgz|KidItem\.AgentGateway\.exe|gateway-runtime-contract\.json)'[,]?$/gm)].map((match) => match[1]),
    ['agent-gateway.tgz', 'KidItem.AgentGateway.exe', 'gateway-runtime-contract.json'],
  );
});

test('Gateway reuse behavior covers script-only reuse, impact builds, fallback, and target identity', { skip: process.platform !== 'win32' }, () => {
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', join(root, 'scripts', '__tests__', 'office-gateway-reuse.fixture.ps1'),
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /office-gateway-reuse fixture passed/);
});

test('Gateway release validation and cleanup support Windows extended-length paths', { skip: process.platform !== 'win32' }, () => {
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', join(root, 'scripts', '__tests__', 'office-gateway-long-path.fixture.ps1'),
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /office-gateway-long-path fixture passed/);
});

test('runtime manifest records local image IDs, Gateway hash, and cutover evidence', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  assert.match(script, /schemaVersion = 3/);
  assert.match(script, /buildKind = 'local-exact-sha'/);
  assert.match(script, /apiImageId = \$images\.ApiImageId/);
  assert.match(script, /webImageId = \$images\.WebImageId/);
  assert.match(script, /gatewayArtifactSha256 = \$gateway\.ArtifactSha256/);
  assert.match(script, /schemaData = \[ordered\]@/);
  assert.doesNotMatch(script, /workflowRunUrl|apiDigest|webDigest/);
});

test('schema and data surfaces fail closed without explicit cutover approval', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  assert.match(script, /git -C \$CheckoutRoot diff --name-only/);
  assert.match(script, /prisma\.config\.ts scripts\/data-migrations scripts\/run-data-migrations\.ts/);
  assert.match(script, /\[AllowEmptyCollection\(\)\]\[string\[\]\]\$ChangedPaths = @\(\)/);
  assert.match(script, /\[AllowEmptyCollection\(\)\]\[string\[\]\]\$SchemaDataPaths = @\(\)/);
  assert.match(script, /Assert-SchemaDataCutoverContract -ChangedPaths \$schemaDataPaths/);
  assert.doesNotMatch(script, /return ,@\(/);
  assert.match(script, /APPLY_SCHEMA_DATA/);
  assert.match(script, /data:migrate -- up --phase \$Phase/);
  assert.match(script, /npx prisma db push --accept-data-loss/);
  assert.match(script, /Stop-OfficeRuntimeFailClosed 'schema\/data cutover candidate failed'/);
  assert.match(script, /Runtime-only rollback is blocked immediately after a schema\/data cutover/);
});

test('schema/data cutover dumps the database after writers stop and before any database change', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const install = script.slice(script.indexOf('function Install-Deployment {'), script.indexOf('function Show-OfficeStatus {'));
  const cutoverStart = install.indexOf("if ($DeploymentMode -eq 'Cutover') {");
  const cutoverEnd = install.indexOf('Invoke-Checked docker @script:ComposeArgs up --detach --no-build --force-recreate', cutoverStart);
  assert.ok(cutoverStart > 0 && cutoverEnd > cutoverStart, 'Install-Deployment keeps one schema/data cutover branch');
  const cutover = install.slice(cutoverStart, cutoverEnd);

  assert.equal(script.match(/New-CutoverDatabaseDump -GitSha/g)?.length, 1, 'the dump has one call site, inside the cutover branch');
  let previous = -1;
  for (const step of [
    'Stop-GatewayScheduledTask',
    'Invoke-Checked docker @script:ComposeArgs stop api worker web nginx',
    "Wait-ForContainerHealthy 'kiditem-postgres'",
    '$cutoverDatabaseDumpPath = New-CutoverDatabaseDump -GitSha $manifest.gitSha',
    '$cutoverDatabaseWorkStarted = $true',
    'Invoke-ExactShaDataMigrations -WorktreePath $SourceWorktree -Phase pre-schema',
    'npx prisma db push --accept-data-loss',
    'Invoke-ExactShaDataMigrations -WorktreePath $SourceWorktree -Phase post-schema',
  ]) {
    const position = cutover.indexOf(step);
    assert.ok(position > previous, `cutover branch must run "${step}" after the previous step`);
    previous = position;
  }

  assert.doesNotMatch(cutover, /\btry\b|\bcatch\b/, 'a dump failure must reach the fail-closed cutover handler');
  assert.match(
    install,
    /Stop-OfficeRuntimeFailClosed 'schema\/data cutover candidate failed'\s+if \(-not \$cutoverDatabaseWorkStarted\) \{\s+throw [^\n]*stopped before database work began/,
  );
});

test('cutover dump uses container credentials, counts only verified custom-format archives, and prunes to three after success', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const dumpStart = script.indexOf('function New-CutoverDatabaseDump {');
  assert.ok(dumpStart > 0, 'New-CutoverDatabaseDump must exist');
  const dump = script.slice(dumpStart, script.indexOf('\nfunction ', dumpStart));

  assert.match(script, /^\$script:DatabaseDumpsRoot = Join-Path \$script:DeploymentsRoot 'database-dumps'$/m);
  assert.match(script, /^\$script:DatabaseDumpRetentionCount = 3$/m);
  assert.match(dump, /'kiditem-\{0\}-\{1\}\.dump' -f \$timestamp, \$GitSha\.Substring\(0, 12\)/);
  assert.match(dump, /\$partialPath = "\$dumpPath\.partial"/);
  assert.match(
    dump,
    /docker exec kiditem-postgres sh -c \('PGUSER=\$POSTGRES_USER PGDATABASE=\$POSTGRES_DB PGPASSWORD=\$POSTGRES_PASSWORD pg_dump --format=custom --no-password /,
  );
  assert.doesNotMatch(dump, /Get-OfficeEnvValue|Get-ProtectedServerEnvValue|DATABASE_URL/);

  let previous = -1;
  for (const step of [
    'Invoke-Checked docker exec kiditem-postgres sh -c',
    'Invoke-Checked docker cp',
    "-cne 'PGDMP'",
    'Move-Item -LiteralPath $partialPath -Destination $dumpPath',
    'Remove-Item -LiteralPath $partialPath -Force -ErrorAction SilentlyContinue',
    'foreach ($staleDump in @($olderDumps | Select-Object -Skip ($script:DatabaseDumpRetentionCount - 1)))',
    'Remove-Item -LiteralPath $staleDump.FullName -Force',
  ]) {
    const position = dump.indexOf(step);
    assert.ok(position > previous, `cutover dump must run "${step}" after the previous step`);
    previous = position;
  }
  assert.doesNotMatch(dump.slice(0, dump.indexOf('foreach ($staleDump in')), /\bcatch\b/, 'a failed dump must never reach pruning');
  assert.ok(
    dump.includes(String.raw`$_.Name -match '^kiditem-\d{8}T\d{6}Z-[0-9a-f]{12}\.dump$' -and $_.Name -ne $dumpName`),
    'retention counts only completed dumps and never prunes the dump just written',
  );
});

test('controlled recreate preserves runtime evidence and automatically restores app-only failures', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  assert.match(script, /runtime-snapshot\.json/);
  assert.match(script, /runtime-before\.json/);
  assert.match(script, /CurrentManifestPath/);
  assert.match(script, /PreviousManifestPath/);
  assert.match(script, /--detach --no-build --force-recreate api worker web nginx/);
  assert.match(script, /Restore-Transaction \$backupRoot/);
  assert.match(script, /Automatic runtime restore also failed/);
  assert.match(script, /function Invoke-GatewayTransientFileOperation/);
  assert.match(script, /Gateway candidate promotion/);
  assert.match(script, /Gateway retired release restoration/);
  assert.match(script, /Deployment error: \$\(\$deploymentError\.Exception\.Message\) Restore error: \$\(\$restoreError\.Exception\.Message\)/);
  assert.doesNotMatch(script, /docker system prune/);
});

test('deploy checks disk capacity before creating an exact-SHA build worktree', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const deployFlow = script.slice(script.lastIndexOf("'Deploy' {"));
  assert.match(
    deployFlow,
    /Assert-SchemaDataCutoverContract -ChangedPaths \$schemaDataPaths[\s\S]*Assert-DiskCapacity[\s\S]*New-CleanSourceWorktree/,
  );
});

test('Gateway uses the invoking Windows profile and its existing Node 22', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  assert.match(script, /WindowsIdentity\]::GetCurrent\(\)\.Name/);
  assert.match(script, /Get-Command node\.exe/);
  assert.match(script, /Get-CheckedOutput -Program \$nodeExecutable -Arguments @\([\s\S]*'-p'/);
  assert.match(script, /requires Node 22 in the invoking profile/);
  assert.match(script, /-LogonType Interactive/);
  assert.match(script, /New-ScheduledTaskTrigger -AtLogOn/);
  assert.doesNotMatch(script, /GatewayTaskCredential|Get-Credential|ProgramFiles.*nodejs/);
});

test('Office compose keeps env and external volumes while accepting only prebuilt images', () => {
  const compose = read('deploy/office/compose.office.yml');
  assert.doesNotMatch(compose, /^\s*build\s*:/m);
  assert.match(compose, /external: true/);
  assert.match(compose, /KIDITEM_API_IMAGE/);
  assert.match(compose, /KIDITEM_WEB_IMAGE/);
  assert.match(compose, /local runtime manifest/);
});

test('PowerShell deployment operator parses on Windows', { skip: process.platform !== 'win32' }, () => {
  const command = String.raw`foreach($file in @('deploy/office/apply-deployment.ps1','deploy/office/gateway-build.ps1')){$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $file),[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){exit 1}}`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('status and rollback retain schema-3 archived-runtime admission', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  assert.match(script, /'Status'\s*\{\s*Show-OfficeStatus \$head/);
  assert.match(script, /function Install-Deployment[\s\S]*Read-DeploymentManifest \$TargetManifestPath/);
  assert.match(script, /'Rollback'\s*\{[\s\S]*Install-Deployment -TargetManifestPath \$script:PreviousManifestPath/);
  assert.match(script, /Install-Deployment -TargetManifestPath \$script:PreviousManifestPath -DeploymentMode Rollback/);
  assert.match(script, /Get-ArchivedGatewayArtifact \$previousManifest/);
  assert.match(script, /--detach --no-build --force-recreate api worker web nginx/);
});

test('runbooks describe the local exact-SHA contract and no GitHub Office bundle fallback', () => {
  const architecture = read('docs/runbooks/deployment-architecture.md');
  const office = read('docs/runbooks/office-deploy.md');
  for (const text of [architecture, office]) {
    assert.match(text, /npm run deploy:office:local/);
    assert.match(text, /origin\/release\/office/);
    assert.match(text, /provisional/i);
    assert.match(text, /deploy:office:status/);
    assert.match(text, /deploy:office:rollback/);
    assert.doesNotMatch(text, /office-images\.yml|develop-gateway-package\.yml/);
  }
});
