import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, 'utf8');
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
  assert.doesNotMatch(compose, /interaction-gateway/);
  assert.doesNotMatch(compose, /AGENT_DURABLE_RUNTIME_RUN_ROOT/);
  assert.doesNotMatch(compose, /AGENT_RUNTIME_(?:CONCURRENCY|CAPACITY_WAIT_MS|CLAUDE_MAX_BUDGET_USD|WORKER_ENABLED)/);
  assert.match(compose, /KIDITEM_APPLICATION_VERSION: \$\{KIDITEM_APPLICATION_VERSION:\?/);
  assert.match(compose, /KIDITEM_GIT_SHA: \$\{KIDITEM_GIT_SHA:\?/);
});

test('office Compose injects the managed Chrome CDP endpoint into the API runtime', () => {
  const envExample = read('deploy/office/office.env.example');
  const endpoint = /^SOURCING_PLAYWRIGHT_CDP_ENDPOINT=(.+)$/m.exec(envExample)?.[1];
  assert.equal(endpoint, 'http://kiditem-office:9444');

  const result = spawnSync(
    'docker',
    [
      'compose',
      '--env-file', 'deploy/office/office.env.example',
      '--env-file', 'deploy/office/digest.env.example',
      '-f', 'deploy/office/compose.office.yml',
      'config', '--format', 'json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        OFFICE_API_ENV_FILE: process.platform === 'win32' ? 'NUL' : '/dev/null',
        KIDITEM_APPLICATION_VERSION: '0.0.0-test',
        KIDITEM_GIT_SHA: 'a'.repeat(40),
      },
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const resolved = JSON.parse(result.stdout);
  assert.equal(
    resolved.services.api.environment.SOURCING_PLAYWRIGHT_CDP_ENDPOINT,
    endpoint,
  );
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
    2,
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

test('office deployment renders a manifest-derived candidate env and rejects stale images before writers stop', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const candidate = script.indexOf('Write-DeployEnv $candidateDeployEnv $manifest');
  const render = script.indexOf('Assert-RenderedManifestDeployment $manifest');
  const stop = script.indexOf('Invoke-Checked docker @script:ComposeArgs stop api worker web nginx');

  assert.ok(candidate >= 0, 'candidate deploy env must be derived from the signed manifest');
  assert.ok(render > candidate && render < stop, 'rendered images/SHA/version must be checked before stopping writers');
  assert.match(script, /Rendered \$name image does not match manifest API image/);
  assert.match(script, /Rendered web image does not match manifest web image/);
  assert.match(script, /KIDITEM_APPLICATION_VERSION does not match manifest app version/);
  assert.match(script, /KIDITEM_GIT_SHA does not match manifest git SHA/);
});

test('clean cutover renders its own manifest-derived deploy env before the documented writer stop', () => {
  const runbook = read('docs/runbooks/agent-os-clean-cutover.md');
  const candidate = runbook.indexOf("$deployEnv = Join-Path $officeRoot '.env.office.deploy'");
  const compose = runbook.indexOf("$compose = @('compose','--project-name','kiditem-office','--env-file',\"$officeRoot\\.env.office\",'--env-file',$deployEnv");
  const render = runbook.indexOf('config --format json');
  const stop = runbook.indexOf('& docker @compose stop api worker web nginx');

  assert.ok(candidate >= 0, 'cutover must create a protected deploy env from its reviewed manifest');
  assert.ok(compose > candidate && render > compose && render < stop,
    'cutover must render and verify the candidate image/SHA/version before writers stop');
  assert.match(runbook, /Rendered \$name image does not match manifest API image/);
  assert.match(runbook, /Rendered \$name KIDITEM_GIT_SHA does not match manifest git SHA/);
});

test('office API runtime includes the Prisma CLI used by explicit schema apply', () => {
  const serverPackage = JSON.parse(read('apps/server/package.json'));
  assert.equal(typeof serverPackage.dependencies.prisma, 'string');
  assert.equal(serverPackage.devDependencies?.prisma, undefined);
});

test('office API image validates the current API and worker application roots', () => {
  const dockerfile = read('apps/server/Dockerfile');

  assert.match(dockerfile, /require\('\.\/apps\/server\/dist\/api-application\.module\.js'\)/);
  assert.match(dockerfile, /require\('\.\/apps\/server\/dist\/agent-worker-application\.module\.js'\)/);
  assert.doesNotMatch(dockerfile, /require\('\.\/apps\/server\/dist\/app\.module\.js'\)/);
});

test('office API image has no process-inspection dependency after Host Runner cutover', () => {
  const dockerfile = read('apps/server/Dockerfile');

  assert.doesNotMatch(dockerfile, /\bprocps\b/);
  assert.doesNotMatch(dockerfile, /command -v ps/);
});

test('office API image context resolves every published Agent instruction profile exactly', () => {
  const definitions = read('apps/server/src/agent-os/domain/agent-definition.registry.ts');
  const publication = read('apps/server/src/agent-os/domain/catalog/agent-version-publication.registry.ts');
  const dockerignore = read('.dockerignore');
  const dockerfile = read('apps/server/Dockerfile');
  const agentKeys = [...definitions.matchAll(/key: '([^']+)'/g)].map((match) => match[1]);
  const profileRefs = agentKeys.map((key) => `agent-config/prompts/agents/${key}.md`);

  assert.equal(agentKeys.length, 6);
  assert.match(publication, /`agent-config\/prompts\/agents\/\$\{agent\.key\}\.md`/);
  assert.doesNotMatch(dockerignore, /^!agent-config\/prompts\/agents\/\*\.md$/m);
  for (const profileRef of profileRefs) {
    assert.equal(existsSync(`${root}/${profileRef}`), true, `missing published profile ${profileRef}`);
    assert.match(dockerignore, new RegExp(`^!${escapeRegex(profileRef)}$`, 'm'));
    assert.match(dockerfile, new RegExp(escapeRegex(profileRef)));
  }
});

test('office API exposes only the loopback Host Runner boundary and contains no provider runtime', () => {
  const serverPackage = JSON.parse(read('apps/server/package.json'));
  const dockerfile = read('apps/server/Dockerfile');
  const compose = read('deploy/office/compose.office.yml');

  assert.equal(serverPackage.dependencies['@openai/codex'], undefined);
  assert.equal(serverPackage.dependencies['@anthropic-ai/claude-code'], undefined);
  assert.match(dockerfile, /ENV PATH=\/app\/apps\/server\/node_modules\/\.bin:\/app\/node_modules\/\.bin:/);
  assert.doesNotMatch(dockerfile, /(?:codex|claude)\s+--version/i);
  assert.doesNotMatch(dockerfile, /agent-attempt-readiness-canary/);
  assert.match(dockerfile, /COPY agent-config \.\/agent-config/);
  assert.match(dockerfile, /readiness-canary-mcp-server\.js/);
  assert.match(dockerfile, /kiditem-agent-os-mcp-server\.js/);
  assert.doesNotMatch(
    dockerfile,
    /COPY agent-config\/prompts\/agents\/sourcing\.md/,
  );
  assert.match(compose, /- "127\.0\.0\.1:4000:4000"/);
  assert.match(compose, /KIDITEM_AGENT_RUNNER_TOKEN_FILE: \/run\/secrets\/agent_runner_token/);
  const apiService = compose.slice(compose.indexOf('  api:'), compose.indexOf('  worker:'));
  assert.match(apiService, /deploy:\s*\n\s+replicas: 1/);
  assert.doesNotMatch(compose, /KIDITEM_AGENT_RUNTIME_LOOPBACK_ORIGIN|:4401/);
  assert.match(compose, /agent_runner_token:/);
  assert.match(compose, /AGENT_CLI_MAX_CONCURRENCY: \$\{AGENT_CLI_MAX_CONCURRENCY:-4\}/);
  for (const key of ['OPERATOR', 'SOURCING', 'MERCHANDISING', 'SUPPLY', 'CHANNEL_OPERATIONS', 'ADVERTISING']) {
    assert.match(compose, new RegExp('AGENT_' + key + '_MODEL: \\$\\{AGENT_' + key + '_MODEL:\\?'));
  }
  assert.doesNotMatch(compose, /kiditem-agent-runs:\/var\/lib\/kiditem-agent-runs/);
  assert.doesNotMatch(compose, /(?:KIDITEM_ATTEMPT_LOGIN_HOME|CODEX_HOME|CLAUDE_CONFIG_DIR|kiditem-cli-home|cli-login|\b(?:codex|claude)\b)/i);
  assert.doesNotMatch(compose, /OPENAI_API_KEY|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN/);
  const worker = compose.slice(compose.indexOf('  worker:'), compose.indexOf('  web:'));
  assert.doesNotMatch(worker, /(?:HOME|CODEX_HOME|CLAUDE_CONFIG_DIR|KIDITEM_ATTEMPT_LOGIN_HOME|kiditem-cli-home)/);
  const runbook = read('docs/runbooks/office-deploy.md');
  assert.doesNotMatch(runbook, /docker compose run --rm --no-deps cli-login/);
  assert.doesNotMatch(runbook, /docker exec[^\n]*(codex|claude)/i);
});

test('Office release builds one immutable Windows Host Runner artifact alongside the exact image release', () => {
  const workflow = read('.github/workflows/office-images.yml');

  assert.match(workflow, /build_runner_windows:/);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /ref: \$\{\{ needs\.identity_guard\.outputs\.git_sha \}\}/);
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run build --workspace=packages\/shared/);
  assert.match(workflow, /npm run build --workspace=apps\/agent-runner/);
  assert.match(
    workflow,
    /dotnet publish apps\/agent-runner\/windows\/KidItem\.JobRunner\/KidItem\.JobRunner\.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true/,
  );
  assert.match(workflow, /npm pack --workspace=apps\/agent-runner/);
  assert.match(workflow, /kiditem-agent-runner-windows-x64\.zip/);
  assert.match(workflow, /KidItem\.JobRunner\.exe/);
  assert.match(workflow, /runner-runtime-contract\.json/);
  assert.match(workflow, /Get-FileHash .* -Algorithm SHA256/);
  assert.match(workflow, /Expand-Archive/);
  assert.match(workflow, /codex(?:\.cmd|\.js)?[^\r\n]*--version/);
  assert.match(workflow, /claude(?:\.cmd|\.exe)?[^\r\n]*--version/);
  assert.match(workflow, /Run the unpacked Windows Job Object fixture/);
  assert.match(workflow, /unpacked Windows Job Object helper rejected malformed input/);
  assert.match(workflow, /npm exec --workspace=apps\/agent-runner vitest -- run/);
  assert.match(workflow, /needs:\s*[\s\S]*build_runner_windows/);
  assert.match(workflow, /actions\/download-artifact@/);
  assert.match(workflow, /schemaVersion: 2/);
  assert.match(workflow, /runnerArtifact/);
  assert.match(workflow, /runnerArtifactSha256/);
  assert.match(workflow, /(?:platform:\s*'windows'|\.platform == "windows")/);
  assert.match(workflow, /mcpProtocolRevision/);
  assert.match(workflow, /cliContractIdentity/);
  assert.match(workflow, /codexVersion/);
  assert.match(workflow, /claudeVersion/);
});

test('PR validation exercises the Windows Runner packaging boundary without a host install', () => {
  const workflow = read('.github/workflows/pr-checks.yml');

  assert.match(workflow, /windows_runner_package:/);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run build --workspace=packages\/shared/);
  assert.match(workflow, /npm run build --workspace=apps\/agent-runner/);
  assert.match(workflow, /npm exec --workspace=apps\/agent-runner vitest -- run/);
  assert.match(
    workflow,
    /dotnet publish apps\/agent-runner\/windows\/KidItem\.JobRunner\/KidItem\.JobRunner\.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true/,
  );
  assert.match(workflow, /npm pack --workspace=apps\/agent-runner --dry-run/);
});

test('Office operator binds API, Runner package, scheduler, token rotation, and rollback to one release identity', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const compose = read('deploy/office/compose.office.yml');

  assert.match(script, /ValidateSet\('Deploy', 'Status', 'Rollback', 'RotateRunnerToken'\)/);
  assert.match(script, /\$OfficeRoot = 'C:\\ProgramData\\KidItem'/);
  assert.match(script, /schemaVersion -ne 2/);
  assert.match(script, /runnerArtifact/);
  assert.match(script, /runnerArtifactSha256/);
  assert.match(script, /runnerRuntime/);
  assert.match(script, /RunnerReleasesRoot/);
  assert.match(script, /RunnerRoot/);
  assert.match(script, /RunnerReleasesRoot = Join-Path \$script:RunnerRoot 'releases'/);
  assert.match(script, /KidItem Agent Runner/);
  assert.match(script, /New-ScheduledTaskPrincipal/);
  assert.match(script, /-LogonType S4U/);
  assert.match(script, /New-ScheduledTaskTrigger -AtStartup/);
  assert.match(script, /RestartCount/);
  assert.match(script, /Set-RunnerProtectedAcl/);
  assert.match(script, /\/setowner', 'Administrators'/);
  assert.match(script, /\$systemRights = \$serviceRights/);
  assert.match(script, /Set-RunnerProtectedAcl -Path \(Join-Path \$candidateRoot 'package'\) -Mode ReadExecute/);
  assert.match(script, /Get-FileHash -LiteralPath .* -Algorithm SHA256/);
  assert.match(script, /Expand-Archive/);
  assert.match(script, /Start-ScheduledTask/);
  assert.match(script, /Stop-ScheduledTask/);
  assert.match(script, /Wait-ForAgentRuntimeReadiness/);
  assert.match(script, /internal\/agent-runtime\/runner\/readiness/);
  assert.match(script, /Switch-RunnerCurrentRelease/);
  assert.match(script, /Restore-Transaction/);
  assert.match(script, /Move-RunnerProtectedFile -Candidate \$restorePointer -Target \$script:RunnerCurrentPointerPath/);
  assert.match(script, /RotateRunnerToken/);
  assert.match(script, /RandomNumberGenerator/);
  assert.match(script, /ToBase64String/);
  assert.match(script, /TrimEnd\('\='/);
  assert.match(script, /Move-RunnerProtectedFile -Candidate \$candidate -Target \$script:RunnerTokenPath/);
  assert.match(script, /\[System\.IO\.File\]::Replace/);
  assert.doesNotMatch(script, /New-NetFirewallRule|netsh\s+advfirewall|TcpListener|HttpListener/i);
  assert.doesNotMatch(script, /(?:codex|claude).*credential|credential.*(?:codex|claude)/i);
  assert.match(compose, /- "127\.0\.0\.1:4000:4000"/);
  assert.match(compose, /C:\/ProgramData\/KidItem\/nginx\.conf/);
  assert.doesNotMatch(compose, /:4401/);
  assert.match(compose, /KIDITEM_AGENT_RUNNER_TOKEN_FILE: \/run\/secrets\/agent_runner_token/);
  assert.match(compose, /agent_runner_token:/);
});

test('Office deployment validates a closed manifest/archive shape and bootstraps only the protected Runner bearer', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const archiveCheck = script.indexOf('Assert-RunnerOuterArchiveEntries (Join-Path $candidateRoot $Manifest.runnerArtifact)');
  const expand = script.indexOf('Expand-Archive -LiteralPath (Join-Path $candidateRoot $Manifest.runnerArtifact)');

  assert.match(script, /function Assert-ManifestShape/);
  assert.match(script, /Compare-Object/);
  assert.match(script, /function Assert-RunnerOuterArchiveEntries/);
  assert.match(script, /\[System\.IO\.Compression\.ZipFile\]::OpenRead/);
  assert.ok(archiveCheck >= 0 && archiveCheck < expand, 'outer archive entries must be admitted before extraction');
  assert.match(script, /if \(-not \(Test-Path -LiteralPath \$script:RunnerTokenPath -PathType Leaf\)\) \{[\s\S]*Replace-RunnerInstallationToken/);
});

test('Office Runner config binds the post-promotion version root, not its temporary extraction directory', () => {
  const script = read('deploy/office/apply-deployment.ps1');

  assert.match(script, /\$runtimeRoot = Join-Path \$releaseRoot 'package'/);
  assert.doesNotMatch(script, /\$runtimeRoot = Join-Path \$candidateRoot 'package'/);
});

test('Office Runner config is written as UTF-8 without a BOM for Node strict JSON parsing', () => {
  const script = read('deploy/office/apply-deployment.ps1');

  assert.match(script, /System\.Text\.UTF8Encoding.*\$false/);
  assert.match(script, /\[System\.IO\.File\]::WriteAllText\(\$runnerConfigPath/);
});

test('office MCP v2 ownership is package-local and Compose cannot select a provider protocol mode', () => {
  const serverPackage = JSON.parse(read('apps/server/package.json'));
  const compose = read('deploy/office/compose.office.yml');

  assert.equal(serverPackage.dependencies['@modelcontextprotocol/server'], '2.0.0');
  assert.equal(serverPackage.devDependencies['@modelcontextprotocol/client'], '2.0.0');
  assert.equal(serverPackage.dependencies['@modelcontextprotocol/sdk'], undefined);
  assert.equal(serverPackage.devDependencies['@modelcontextprotocol/sdk'], undefined);
  assert.equal(serverPackage.dependencies['@modelcontextprotocol/core'], undefined);
  assert.equal(serverPackage.devDependencies['@modelcontextprotocol/core'], undefined);
  assert.equal(serverPackage.dependencies['@openai/codex'], undefined);
  assert.equal(serverPackage.dependencies['@anthropic-ai/claude-code'], undefined);
  assert.equal(serverPackage.dependencies['zod-v4'], 'npm:zod@4.4.3');
  assert.equal(serverPackage.dependencies.zod, '^3.25.0');
  assert.equal(serverPackage.dependencies['zod-to-json-schema'], '^3.25.2');
  assert.doesNotMatch(
    compose,
    /^\s*(?:-\s*)?(?:ATTEMPT_MCP_PROTOCOL_MODE|OPERATOR_MCP_MODE|[A-Z0-9_]*MCP_(?:SDK|PROTOCOL|MODE)[A-Z0-9_]*)\s*:/m,
  );
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

test('office deployment passes immutable application identity into the API runtime', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const compose = read('deploy/office/compose.office.yml');
  assert.match(script, /KIDITEM_APPLICATION_VERSION=\$\(\$Manifest\.appVersion\)/);
  assert.match(script, /KIDITEM_GIT_SHA=\$\(\$Manifest\.gitSha\)/);
  assert.match(compose, /KIDITEM_APPLICATION_VERSION: \$\{KIDITEM_APPLICATION_VERSION:\?/);
  assert.match(compose, /KIDITEM_GIT_SHA: \$\{KIDITEM_GIT_SHA:\?/);
});

test('Agent OS clean cutover is Windows/Docker-only, stops writers before quiescence checks, and keeps them stopped on failure', () => {
  const cutover = read('docs/runbooks/agent-os-clean-cutover.md');
  assert.match(cutover, /\$expectedDockerContext = 'desktop-linux'/);
  assert.match(cutover, /pg_dump.*--format=custom/);
  assert.match(cutover, /pg_restore --list/);
  assert.match(cutover, /Get-FileHash -Algorithm SHA256/);
  assert.match(cutover, /npx prisma db push --accept-data-loss/);
  assert.match(cutover, /seed-agent-versions\.cli\.js/);
  assert.match(cutover, /& docker @compose stop api worker web nginx/);
  assert.match(cutover, /& docker @compose ps --status running --services/);
  assert.ok(
    cutover.indexOf('& docker @compose stop api worker web nginx')
      < cutover.indexOf('$pendingMutations ='),
  );
  assert.match(cutover, /\$cutoverError = \$_\.Exception\.Message/);
  assert.match(cutover, /docker cp \$dump kiditem-postgres:/);
  assert.doesNotMatch(cutover, /codex\.exe|claude\.exe|Start-Process\s+(?:codex|claude)/i);
});

test('Agent OS clean cutover inventories and backs up a legacy schema before it queries new Agent OS relations', () => {
  const cutover = read('docs/runbooks/agent-os-clean-cutover.md');
  const schemaPush = cutover.indexOf('npx prisma db push --accept-data-loss');
  const legacyCounts = cutover.indexOf("foreach ($table in 'organizations','users','master_products','operation_runs','channel_listings')");
  const backup = cutover.indexOf('pg_dump -U kiditem -d kiditem --format=custom');
  const pendingMutations = cutover.indexOf('$pendingMutations =');

  assert.ok(schemaPush >= 0, 'cutover must apply the contracted schema');
  assert.ok(legacyCounts >= 0 && legacyCounts < schemaPush, 'legacy-safe inventory must run before schema push');
  assert.ok(backup >= 0 && backup < schemaPush, 'backup must run before schema push');
  assert.ok(pendingMutations > schemaPush, 'new Agent OS relation may be queried only after schema push');
});

test('KID-25 clean-cutover plan stops and confirms writers before mutation quiescence', () => {
  const plan = read('docs/superpowers/plans/2026-08-23-kid-25-agent-os-clean-contraction.md');
  const stopWriters = plan.indexOf('stop API and worker writers');
  const confirmStopped = plan.indexOf('confirm worker shutdown/drain and writers stopped');
  const quiescence = plan.indexOf('verify no ready/executing Agent mutation');

  assert.ok(stopWriters >= 0, 'plan must stop API and worker writers');
  assert.ok(confirmStopped >= 0, 'plan must confirm the worker drain and writer stop');
  assert.ok(quiescence >= 0, 'plan must check Agent mutation quiescence');
  assert.ok(stopWriters < confirmStopped);
  assert.ok(confirmStopped < quiescence);
});
