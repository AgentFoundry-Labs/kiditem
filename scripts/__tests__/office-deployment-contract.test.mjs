import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, 'utf8');

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
  assert.match(compose, /name: kiditem_copilotkit-event-history/);
  assert.equal(compose.match(/external: true/g)?.length, 3);
  assert.doesNotMatch(compose, /SUPABASE_URL|NEXT_PUBLIC_SUPABASE/);
  assert.doesNotMatch(envExample, /SUPABASE_URL|NEXT_PUBLIC_SUPABASE/);
  assert.doesNotMatch(compose, /interaction-gateway/);
  assert.doesNotMatch(compose, /AGENT_DURABLE_RUNTIME_RUN_ROOT/);
  assert.doesNotMatch(compose, /AGENT_RUNTIME_(?:CONCURRENCY|CAPACITY_WAIT_MS|CLAUDE_MAX_BUDGET_USD|WORKER_ENABLED)/);
  assert.match(compose, /KIDITEM_APPLICATION_VERSION: \$\{KIDITEM_APPLICATION_VERSION:\?/);
  assert.match(compose, /KIDITEM_GIT_SHA: \$\{KIDITEM_GIT_SHA:\?/);
});

test('office API alone mounts persistent completed CopilotKit event history', () => {
  const compose = read('deploy/office/compose.office.yml');
  const api = compose.slice(compose.indexOf('  api:'), compose.indexOf('  worker:'));
  const worker = compose.slice(compose.indexOf('  worker:'), compose.indexOf('  web:'));

  assert.match(api, /KIDITEM_COPILOTKIT_SQLITE_PATH: \/var\/lib\/kiditem\/agent-os\/copilotkit-events\.sqlite/);
  assert.match(api, /- copilotkit-event-history:\/var\/lib\/kiditem\/agent-os/);
  assert.doesNotMatch(worker, /KIDITEM_COPILOTKIT_SQLITE_PATH|copilotkit-event-history/);
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
  assert.match(script, /'kiditem_copilotkit-event-history'/);
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
  const render = script.indexOf('Assert-RenderedManifestDeployment $manifest', candidate);
  const stop = script.indexOf('Invoke-Checked docker @script:ComposeArgs stop api worker web nginx', candidate);

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

test('office API image builds the attributed SQLite runner and opens its native SQLite binding under Node 22', () => {
  const dockerfile = read('apps/server/Dockerfile');

  assert.match(dockerfile, /COPY packages\/copilotkit-sqlite-runner\/package\.json \.\/packages\/copilotkit-sqlite-runner\/package\.json/);
  assert.match(dockerfile, /COPY packages\/copilotkit-sqlite-runner \.\/packages\/copilotkit-sqlite-runner/);
  assert.match(dockerfile, /npm run build --workspace=packages\/copilotkit-sqlite-runner/);
  assert.match(dockerfile, /COPY --from=builder \/app\/packages\/copilotkit-sqlite-runner\/dist \.\/packages\/copilotkit-sqlite-runner\/dist/);
  assert.match(dockerfile, /COPY --from=deps \/app\/node_modules\/better-sqlite3 \.\/node_modules\/better-sqlite3/);
  assert.match(dockerfile, /new Database\(':memory:'\)/);
  assert.match(dockerfile, /require\('@kiditem\/copilotkit-sqlite-runner'\)/);
});

test('office API image has no process-inspection dependency after Host Gateway cutover', () => {
  const dockerfile = read('apps/server/Dockerfile');

  assert.doesNotMatch(dockerfile, /\bprocps\b/);
  assert.doesNotMatch(dockerfile, /command -v ps/);
});

test('office API image avoids retired Agent version-profile artifact assertions', () => {
  const dockerfile = read('apps/server/Dockerfile');

  assert.match(dockerfile, /COPY agent-config \.\/agent-config/);
  assert.doesNotMatch(dockerfile, /agent-config\/prompts\/agents\//);
  assert.doesNotMatch(dockerfile, /agent-version-publication/);
});

test('office API exposes only the loopback Host Gateway boundary and contains no provider runtime', () => {
  const serverPackage = JSON.parse(read('apps/server/package.json'));
  const dockerfile = read('apps/server/Dockerfile');
  const compose = read('deploy/office/compose.office.yml');

  assert.equal(serverPackage.dependencies['@openai/codex'], undefined);
  assert.equal(serverPackage.dependencies['@anthropic-ai/claude-code'], undefined);
  assert.match(dockerfile, /ENV PATH=\/app\/apps\/server\/node_modules\/\.bin:\/app\/node_modules\/\.bin:/);
  assert.doesNotMatch(dockerfile, /(?:codex|claude)\s+--version/i);
  assert.doesNotMatch(dockerfile, /agent-attempt-readiness-canary/);
  assert.match(dockerfile, /COPY agent-config \.\/agent-config/);
  assert.doesNotMatch(dockerfile, /readiness-canary-mcp-server\.js/);
  assert.doesNotMatch(dockerfile, /kiditem-agent-os-mcp-server\.js/);
  assert.doesNotMatch(
    dockerfile,
    /COPY agent-config\/prompts\/agents\/sourcing\.md/,
  );
  assert.match(compose, /- "127\.0\.0\.1:4000:4000"/);
  const apiService = compose.slice(compose.indexOf('  api:'), compose.indexOf('  worker:'));
  assert.match(apiService, /deploy:\s*\n\s+replicas: 1/);
  assert.match(apiService, /KIDITEM_AGENT_GATEWAY_TOKEN_FILE: \/run\/secrets\/agent_gateway_token/);
  assert.match(apiService, /MCP_SDK_GENERATION: v2/);
  assert.match(apiService, /MCP_PROTOCOL_NEGOTIATION: auto/);
  assert.doesNotMatch(compose, /KIDITEM_AGENT_RUNTIME_LOOPBACK_ORIGIN|:4401/);
  assert.match(compose, /agent_gateway_token:/);
  assert.match(compose, /AGENT_CLI_MAX_CONCURRENCY: \$\{AGENT_CLI_MAX_CONCURRENCY:-4\}/);
  for (const key of ['OPERATOR', 'SOURCING', 'MERCHANDISING', 'SUPPLY', 'CHANNEL_OPERATIONS', 'ADVERTISING']) {
    assert.match(compose, new RegExp('AGENT_' + key + '_MODEL: \\$\\{AGENT_' + key + '_MODEL:\\?'));
  }
  assert.doesNotMatch(compose, /kiditem-agent-runs:\/var\/lib\/kiditem-agent-runs/);
  assert.doesNotMatch(compose, /(?:KIDITEM_ATTEMPT_LOGIN_HOME|CODEX_HOME|CLAUDE_CONFIG_DIR|kiditem-cli-home|cli-login|\b(?:codex|claude)\b)/i);
  assert.doesNotMatch(compose, /OPENAI_API_KEY|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN/);
  const worker = compose.slice(compose.indexOf('  worker:'), compose.indexOf('  web:'));
  assert.doesNotMatch(worker, /(?:HOME|CODEX_HOME|CLAUDE_CONFIG_DIR|KIDITEM_ATTEMPT_LOGIN_HOME|kiditem-cli-home)/);
  assert.doesNotMatch(worker, /KIDITEM_AGENT_GATEWAY_TOKEN_FILE|agent_gateway_token|MCP_SDK_GENERATION|MCP_PROTOCOL_NEGOTIATION/);
  const runbook = read('docs/runbooks/office-deploy.md');
  assert.doesNotMatch(runbook, /docker compose run --rm --no-deps cli-login/);
  assert.doesNotMatch(runbook, /docker exec[^\n]*(codex|claude)/i);
});

test('Office release builds one immutable Windows Host Gateway artifact alongside the exact image release', () => {
  const workflow = read('.github/workflows/office-images.yml');

  assert.match(workflow, /build_gateway_windows:/);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /ref: \$\{\{ needs\.identity_guard\.outputs\.git_sha \}\}/);
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run build --workspace=packages\/shared/);
  assert.match(workflow, /npm run build --workspace=apps\/agent-gateway/);
  assert.match(
    workflow,
    /dotnet publish apps\/agent-gateway\/windows\/KidItem\.JobRunner\/KidItem\.JobRunner\.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true/,
  );
  assert.match(workflow, /KidItem\.JobRunner\.Fixture\/KidItem\.JobRunner\.Fixture\.csproj/);
  assert.match(workflow, /KIDITEM_WINDOWS_JOB_RUNNER_PATH/);
  assert.match(workflow, /npm pack --workspace=apps\/agent-gateway/);
  assert.match(workflow, /kiditem-agent-gateway-windows-x64\.zip/);
  assert.match(workflow, /KidItem\.AgentGateway\.exe/);
  assert.match(workflow, /gateway-runtime-contract\.json/);
  assert.match(workflow, /Get-FileHash .* -Algorithm SHA256/);
  assert.match(workflow, /Expand-Archive/);
  assert.match(workflow, /codex(?:\.cmd|\.js)?[^\r\n]*--version/);
  assert.match(workflow, /claude(?:\.cmd|\.exe)?[^\r\n]*--version/);
  assert.match(workflow, /Run the unpacked Windows Job Object fixture/);
  assert.match(workflow, /unpacked Windows Job Object helper rejected malformed input/);
  assert.match(workflow, /npm exec --workspace=apps\/agent-gateway vitest -- run/);
  assert.match(workflow, /needs:\s*[\s\S]*build_gateway_windows/);
  assert.match(workflow, /actions\/download-artifact@/);
  assert.match(workflow, /schemaVersion: 2/);
  assert.match(workflow, /gatewayArtifact/);
  assert.match(workflow, /gatewayArtifactSha256/);
  assert.match(workflow, /(?:platform:\s*'windows'|\.platform == "windows")/);
  assert.match(workflow, /mcpProtocolRevision/);
  assert.match(workflow, /cliContractIdentity/);
  assert.match(workflow, /codexVersion/);
  assert.match(workflow, /claudeVersion/);
  assert.doesNotMatch(workflow, /apps\/agent-runner|kiditem-agent-runner/);
});

test('PR validation exercises the Windows Gateway packaging boundary without a host install', () => {
  const workflow = read('.github/workflows/pr-checks.yml');

  assert.match(workflow, /windows_gateway_package:/);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run build --workspace=packages\/shared/);
  assert.match(workflow, /npm run build --workspace=apps\/agent-gateway/);
  assert.match(workflow, /npm exec --workspace=apps\/agent-gateway vitest -- run/);
  assert.match(
    workflow,
    /dotnet publish apps\/agent-gateway\/windows\/KidItem\.JobRunner\/KidItem\.JobRunner\.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true/,
  );
  assert.match(workflow, /npm pack --workspace=apps\/agent-gateway --dry-run/);
  assert.match(workflow, /node --test scripts\/__tests__\/office-deployment-contract\.test\.mjs/);
  assert.match(workflow, /node --test scripts\/__tests__\/office-gateway-launcher\.test\.mjs/);
  assert.match(workflow, /\[System\.Management\.Automation\.Language\.Parser\]::ParseFile\('deploy\/office\/apply-deployment\.ps1'/);
  assert.match(workflow, /office-windows-native-runtime\.fixture\.ps1/);
  assert.match(workflow, /KidItem\.JobRunner\.Fixture\/KidItem\.JobRunner\.Fixture\.csproj/);
  assert.match(workflow, /KIDITEM_WINDOWS_JOB_RUNNER_PATH/);
  assert.match(workflow, /-AgentGatewayPath .*KidItem\.JobRunner\.exe/);
  assert.doesNotMatch(workflow, /apps\/agent-runner|kiditem-agent-runner/);
});

test('Windows CI keeps the frozen native JobRunner helper as a build-only seam while packaging the Gateway interface', () => {
  const releaseWorkflow = read('.github/workflows/office-images.yml');
  const prWorkflow = read('.github/workflows/pr-checks.yml');

  for (const workflow of [releaseWorkflow, prWorkflow]) {
    const publish = workflow.indexOf('dotnet publish apps/agent-gateway/windows/KidItem.JobRunner/KidItem.JobRunner.csproj');
    const vitest = workflow.indexOf('npm exec --workspace=apps/agent-gateway vitest -- run', publish);
    assert.ok(publish >= 0 && vitest > publish,
      'the Windows Job helper must be published before the mandatory Gateway Vitest suite');
    assert.match(workflow, /\$env:KIDITEM_WINDOWS_JOB_RUNNER_PATH\s*=\s*\(Join-Path \$env:RUNNER_TEMP 'kiditem-agent-gateway-native\\\\KidItem\.JobRunner\.exe'\)/);
    assert.doesNotMatch(workflow, /apps\/agent-runner|kiditem-agent-runner/);
  }
});

test('Windows provider probes stage the bundled runtime before they resolve a production CLI', () => {
  for (const path of ['.github/workflows/office-images.yml', '.github/workflows/pr-checks.yml']) {
    const workflow = read(path);
    const stage = workflow.indexOf('npm run prepack --workspace=apps/agent-gateway');
    const vitest = workflow.indexOf('npm exec --workspace=apps/agent-gateway vitest -- run', stage);
    const cleanup = workflow.indexOf('npm run postpack --workspace=apps/agent-gateway', vitest);

    assert.ok(stage >= 0 && vitest > stage,
      `${path} must stage the exact bundled provider runtime before its Windows resolver probe`);
    assert.ok(cleanup > vitest,
      `${path} must remove the temporary staged runtime after the native probe`);
  }
});

test('Office rehydrates every cached Gateway release from the immutable archive before start or recovery', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const fixture = read('scripts/__tests__/office-windows-native-runtime.fixture.ps1');
  const newRelease = script.slice(
    script.indexOf('function New-GatewayRelease'),
    script.indexOf('function Get-GatewayCurrentRelease'),
  );
  const rotate = script.slice(script.indexOf('function Rotate-GatewayToken'), script.indexOf('function Restore-Transaction'));
  const restore = script.slice(script.indexOf('function Restore-Transaction'), script.indexOf('function Install-Deployment'));

  assert.match(script, /function Get-ArchivedGatewayArtifact/);
  assert.match(newRelease, /Stop-GatewayScheduledTask/);
  assert.match(newRelease, /retired-/);
  assert.ok(
    newRelease.indexOf('if (Test-Path -LiteralPath $releaseRoot -PathType Container)')
      > newRelease.indexOf('$candidateRoot ='),
    'an existing release root may be retired only after a new artifact-derived candidate exists',
  );
  assert.match(rotate, /Get-ArchivedGatewayArtifact/);
  assert.match(rotate, /New-GatewayRelease/);
  assert.match(restore, /Get-ArchivedGatewayArtifact/);
  assert.match(restore, /New-GatewayRelease/);
  assert.match(fixture, /tampered cached Gateway release/i);
  assert.match(fixture, /Restore-Transaction/);
});

test('Office ACL repair takes ownership before inspecting an unreadable protected DACL', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const fixture = read('scripts/__tests__/office-windows-native-runtime.fixture.ps1');
  const protection = script.slice(
    script.indexOf('function Set-GatewayProtectedAcl'),
    script.indexOf('function Initialize-GatewayStorage'),
  );

  assert.match(script, /function Invoke-GatewayProtectedOwnerTakeover/);
  assert.match(script, /takeown\.exe/);
  assert.match(script, /& takeown\.exe \/F \$Path \/A \*> \$null/);
  assert.doesNotMatch(script, /takeown\.exe[^\r\n]*\/(?:R|D)\b/);
  assert.ok(
    protection.indexOf('Invoke-GatewayProtectedOwnerTakeover') < protection.indexOf('Get-Acl -LiteralPath $Path'),
    'owner takeover must precede ACL inspection so an administrator can repair a poisoned DACL',
  );
  assert.match(fixture, /owner takeover failure/i);
});

test('Windows scheduler fixture preserves the actual restart settings passed to the production task factory', () => {
  const fixture = read('scripts/__tests__/office-windows-native-runtime.fixture.ps1');

  assert.match(fixture, /XmlConvert\]::ToString\(\[TimeSpan\]\$RestartInterval\)/);
  assert.match(fixture, /XmlConvert\]::ToString\(\[TimeSpan\]\$ExecutionTimeLimit\)/);
  assert.doesNotMatch(fixture, /RestartInterval = 'PT1M'/);
  assert.doesNotMatch(fixture, /ExecutionTimeLimit = 'PT0S'/);
});

test('Office operator binds API, Gateway package, scheduler, token rotation, and rollback to one release identity', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const compose = read('deploy/office/compose.office.yml');
  const nginx = read('deploy/office/nginx.conf');

  assert.match(script, /ValidateSet\('Deploy', 'CutoverDeploy', 'Status', 'Rollback', 'RotateGatewayToken', 'InstallOrUpdateGatewayTask'\)/);
  assert.match(script, /\$script:OfficeRoot = 'C:\\ProgramData\\KidItem'/);
  assert.match(script, /schemaVersion -ne 2/);
  assert.match(script, /gatewayArtifact/);
  assert.match(script, /gatewayArtifactSha256/);
  assert.match(script, /gatewayRuntime/);
  assert.match(script, /GatewayReleasesRoot/);
  assert.match(script, /GatewayRoot/);
  assert.match(script, /GatewayReleasesRoot = Join-Path \$script:GatewayRoot 'releases'/);
  assert.match(script, /KidItem Agent Gateway/);
  assert.match(script, /New-ScheduledTaskPrincipal/);
  assert.match(script, /-LogonType Password/);
  assert.match(script, /-GatewayTaskCredential/);
  assert.match(script, /New-ScheduledTaskTrigger -AtStartup/);
  assert.match(script, /RestartCount/);
  assert.match(script, /Set-GatewayProtectedAcl/);
  assert.match(script, /Get-GatewayProtectionSpec/);
  assert.match(script, /\$security\.SetOwner\(\$administratorsSid\)/);
  assert.match(script, /\[System\.Security\.Principal\.SecurityIdentifier\]::new\('S-1-5-32-544'\)/);
  assert.match(script, /Set-GatewayProtectedAcl -Path \(Join-Path \$candidateRoot 'package'\) -Mode ReadExecute/);
  assert.match(script, /Get-FileHash -LiteralPath .* -Algorithm SHA256/);
  assert.match(script, /Expand-Archive/);
  assert.match(script, /Start-ScheduledTask/);
  assert.match(script, /Stop-ScheduledTask/);
  assert.doesNotMatch(script, /Wait-ForAgentRuntimeReadiness|internal\/agent-runtime\/gateway\/readiness/);
  assert.match(script, /Switch-GatewayCurrentRelease/);
  assert.match(script, /Restore-Transaction/);
  assert.match(script, /Move-GatewayProtectedFile -Candidate \$restorePointer -Target \$script:GatewayCurrentPointerPath/);
  assert.match(script, /RotateGatewayToken/);
  assert.match(script, /RandomNumberGenerator/);
  assert.match(script, /ToBase64String/);
  assert.match(script, /TrimEnd\('\='/);
  assert.match(script, /Move-GatewayProtectedFile -Candidate \$candidate -Target \$script:GatewayTokenPath/);
  assert.match(script, /\[System\.IO\.File\]::Replace/);
  assert.doesNotMatch(script, /New-NetFirewallRule|netsh\s+advfirewall|TcpListener|HttpListener/i);
  assert.doesNotMatch(script, /(?:codex|claude).*credential|credential.*(?:codex|claude)/i);
  assert.match(compose, /- "127\.0\.0\.1:4000:4000"/);
  assert.match(compose, /C:\/ProgramData\/KidItem\/nginx\.conf/);
  assert.doesNotMatch(compose, /:4401/);
  assert.match(compose, /KIDITEM_AGENT_GATEWAY_TOKEN_FILE: \/run\/secrets\/agent_gateway_token/);
  assert.match(compose, /agent_gateway_token:/);
  assert.match(nginx, /location \^~ \/internal\/ \{\s*return 404;/);
  assert.doesNotMatch(nginx, /4401/);
});

test('Office deployment validates a closed manifest/archive shape and bootstraps only the protected Gateway bearer', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const packageContents = script.slice(
    script.indexOf('function Assert-GatewayPackageContents'),
    script.indexOf('function Assert-GatewayArchiveEntryName'),
  );
  const archiveCheck = script.indexOf('Assert-GatewayOuterArchiveEntries (Join-Path $candidateRoot $Manifest.gatewayArtifact)');
  const expand = script.indexOf('Expand-Archive -LiteralPath (Join-Path $candidateRoot $Manifest.gatewayArtifact)');

  assert.match(script, /function Assert-ManifestShape/);
  assert.match(script, /Compare-Object/);
  assert.match(script, /function Assert-GatewayOuterArchiveEntries/);
  assert.match(script, /\[System\.IO\.Compression\.ZipFile\]::OpenRead/);
  assert.match(script, /function Assert-GatewayArchiveEntryName/);
  assert.match(script, /\$Entry\.IndexOf\(\[char\]92\) -ge 0/);
  assert.match(script, /\$name\.IndexOf\(\[char\]92\) -ge 0/);
  assert.match(script, /tar\.exe -tvf/);
  assert.match(script, /Gateway package archive contains a non-regular entry/);
  assert.match(script, /Gateway archive contains a non-regular entry/);
  assert.match(script, /function Assert-GatewayExtractionTree/);
  assert.match(script, /ReparsePoint/);
  assert.match(script, /canonical descendant escapes the candidate root/);
  assert.match(packageContents, /Join-Path \$ReleaseRoot 'package\\\\windows\\\\KidItem\.AgentGateway\.exe'/);
  assert.ok(archiveCheck >= 0 && archiveCheck < expand, 'outer archive entries must be admitted before extraction');
  assert.match(script, /if \(-not \(Test-Path -LiteralPath \$script:GatewayTokenPath -PathType Leaf\)\) \{[\s\S]*Replace-GatewayInstallationToken/);
});

test('Office deployment fails closed when rollback cannot re-establish one coherent API, web, worker, and Gateway identity', () => {
  const script = read('deploy/office/apply-deployment.ps1');

  assert.match(script, /function Stop-OfficeRuntimeFailClosed/);
  assert.match(script, /Stop-GatewayScheduledTask/);
  assert.match(script, /stop api worker web nginx/);
  assert.match(script, /'kiditem-api', 'kiditem-worker', 'kiditem-web', 'kiditem-nginx'/);
  assert.match(script, /function Assert-CurrentOfficeReleaseIdentity/);
  assert.match(script, /Restore-Transaction[\s\S]*Assert-CurrentOfficeReleaseIdentity/);
  assert.match(script, /Stop-OfficeRuntimeFailClosed 'Automatic runtime restore also failed'/);
  assert.match(script, /Stop-OfficeRuntimeFailClosed 'Gateway token rotation rollback also failed'/);
  assert.doesNotMatch(script, /try\s*\{\s*try\s*\{/);
  assert.doesNotMatch(script, /Write-Warning "Automatic runtime restore also failed: \$\(_\.Exception\.Message\)"/);
});

test('Office deployment protects the derived ProgramData KidItem anchor before it creates Gateway descendants', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const nativeFixture = read('scripts/__tests__/office-windows-native-runtime.fixture.ps1');
  const initialization = script.slice(
    script.indexOf('function Initialize-GatewayStorage'),
    script.indexOf('function Set-ComposeArguments'),
  );
  const officeRoot = initialization.indexOf('New-Item -ItemType Directory -Path $script:OfficeRoot -Force');
  const protectOfficeRoot = initialization.indexOf('Set-GatewayProtectedAcl -Path $script:OfficeRoot -Mode ReadExecute -Anchor');
  const gatewayRoot = initialization.indexOf('New-Item -ItemType Directory -Path $script:GatewayRoot -Force');

  assert.ok(officeRoot >= 0 && protectOfficeRoot > officeRoot && gatewayRoot > protectOfficeRoot,
    'the fixed C:\\ProgramData\\KidItem ACL anchor must be protected before Gateway children inherit it');
  assert.match(script, /function Set-GatewayProtectedAcl[\s\S]*\[switch\]\$Anchor/);
  assert.match(script, /System\.Security\.AccessControl\.FileSystemSecurity/);
  assert.match(script, /SetAccessRuleProtection\(\$true, \$false\)/);
  assert.match(script, /RemoveAccessRuleSpecific/);
  assert.match(script, /function Assert-GatewayProtectedAcl/);
  assert.match(script, /GetOwner\(\[System\.Security\.Principal\.SecurityIdentifier\]\)/);
  assert.doesNotMatch(script, /function Invoke-Icacls/);
  assert.match(nativeFixture, /Set-GatewayProtectedAcl[\s\S]*-Principal/);
  assert.match(nativeFixture, /untrusted owner|arbitrary explicit SID/i);
});

test('Windows-native fixture invokes the production ACL, scheduler, and strict manifest admission functions', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const nativeFixture = read('scripts/__tests__/office-windows-native-runtime.fixture.ps1');

  assert.match(nativeFixture, /Set-GatewayProtectedAcl/);
  assert.match(nativeFixture, /Register-GatewayScheduledTask/);
  assert.match(nativeFixture, /Assert-GatewayScheduledTaskContract/);
  assert.match(nativeFixture, /Read-DeploymentManifest/);
  assert.match(nativeFixture, /wrong scalar|unknown manifest field|manifest drift/i);
  assert.match(script, /\$triggers\.Count -ne 1/);
  assert.match(script, /function Assert-ManifestStringField/);
  assert.match(script, /function Assert-ManifestIntegerField/);
  assert.match(script, /Manifest field .* must be a string/);
});

test('Office deployment owns one canonical ProgramData anchor and writes the Gateway state/workspace config', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const gatewayConfig = read('apps/agent-gateway/src/config/gateway-config.ts');
  const parameters = script.slice(0, script.indexOf('Set-StrictMode'));

  assert.doesNotMatch(parameters, /\[string\]\$OfficeRoot/);
  assert.match(script, /\$script:OfficeRoot = 'C:\\ProgramData\\KidItem'/);
  assert.match(script, /function Assert-OfficeRootAnchor/);
  assert.match(script, /GetFullPath\('C:\\ProgramData\\KidItem'\)/);
  assert.match(script, /Office root anchor is a reparse point/);
  assert.match(script, /Assert-OfficeRootAnchor\s*\n\s*\$head = Assert-LiveCheckout/);
  assert.match(gatewayConfig, /stateRoot: z\.string\(\)\.min\(1\)/);
  assert.match(gatewayConfig, /workspace: z\.string\(\)\.min\(1\)/);
  assert.match(gatewayConfig, /url\.hostname !== '127\.0\.0\.1'/);
  assert.match(gatewayConfig, /url\.port !== '4000'/);
  assert.match(script, /\$script:GatewayStateRoot = Join-Path \$script:GatewayRoot 'state'/);
  assert.match(script, /stateRoot = \$script:GatewayStateRoot/);
  assert.match(script, /workspace = \$RepoRoot/);
});

test('CutoverDeploy never restarts a prior runtime after a contracted-schema candidate failure', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const cutoverCatch = script.indexOf("if ($DeploymentMode -eq 'Cutover')");
  const restore = script.indexOf('Restore-Transaction $backupRoot', cutoverCatch);

  assert.match(script, /ValidateSet\('Deploy', 'CutoverDeploy', 'Status', 'Rollback', 'RotateGatewayToken', 'InstallOrUpdateGatewayTask'\)/);
  assert.match(script, /\[switch\]\$ConfirmCutoverDeploy/);
  assert.match(script, /CutoverDeploy requires -ConfirmCutoverDeploy/);
  assert.match(script, /-ApplySchema is valid only with -Operation Deploy/);
  assert.match(script, /Install-Deployment \$ManifestPath \$head -DeploymentMode Cutover/);
  assert.ok(cutoverCatch >= 0, 'CutoverDeploy must have a dedicated fail-closed catch branch');
  assert.ok(restore > cutoverCatch, 'normal rollback may remain only after the CutoverDeploy fail-closed branch');
  const cutoverBranch = script.slice(cutoverCatch, restore);
  assert.match(cutoverBranch, /Stop-OfficeRuntimeFailClosed/);
  assert.doesNotMatch(cutoverBranch, /Restore-Transaction|up --detach --no-build api worker web nginx/);
  assert.match(cutoverBranch, /Restore the approved pre-cutover database backup manually/);
});

test('Office Gateway separates credentialed task installation from normal runtime lifecycle operations', () => {
  const script = read('deploy/office/apply-deployment.ps1');
  const fixture = read('scripts/__tests__/office-windows-native-runtime.fixture.ps1');
  const workflow = read('.github/workflows/office-images.yml');
  const statusBranch = script.slice(
    script.indexOf("  'Status' {"),
    script.indexOf("  'Deploy' {"),
  );
  const functionBody = (name) => {
    const start = script.indexOf(`function ${name} {`);
    assert.ok(start >= 0, `missing ${name}`);
    const next = script.indexOf('\nfunction ', start + 1);
    return script.slice(start, next < 0 ? script.length : next);
  };
  const normalOperationBodies = [
    functionBody('Install-Deployment'),
    functionBody('Restore-Transaction'),
    functionBody('Rotate-GatewayToken'),
  ];

  assert.match(script, /function Resolve-GatewayServicePrincipal/);
  assert.match(script, /SecurityIdentifier/);
  assert.ok(
    script.includes('"$env:COMPUTERNAME\\$GatewayServiceAccount"'),
    'a bare local account must be normalized to one valid NTAccount separator',
  );
  assert.equal(script.includes('"$env:COMPUTERNAME\\\\$GatewayServiceAccount"'), false);
  assert.match(script, /Assert-GatewayPrincipalIsLeastPrivilege/);
  assert.match(script, /SeBatchLogonRight/);
  assert.match(script, /ProfileList/);
  assert.match(script, /\[pscredential\]\$GatewayTaskCredential/);
  assert.match(script, /function Assert-GatewayTaskCredential/);
  assert.match(script, /GetNetworkCredential\(\)\.Password/);
  assert.match(script, /function Assert-GatewayScheduledTaskContract/);
  assert.match(script, /-LogonType Password/);
  assert.match(script, /Register-ScheduledTask[\s\S]*-User \$Principal\.AccountName[\s\S]*-Password \$taskPassword/);
  assert.match(script, /Task\.Principal\.LogonType\.ToString\(\) -ne 'Password'/);
  assert.match(script, /Task\.Principal\.RunLevel\.ToString\(\) -ne 'Limited'/);
  assert.match(script, /BootTrigger/);
  assert.match(script, /WorkingDirectory/);
  assert.match(script, /RestartCount/);
  assert.match(script, /InstallOrUpdateGatewayTask/);
  assert.match(script, /function Install-OrUpdateGatewayTask/);
  assert.match(functionBody('Install-OrUpdateGatewayTask'), /Register-GatewayScheduledTask/);
  assert.match(functionBody('Install-OrUpdateGatewayTask'), /Assert-GatewayTaskCredential/);
  assert.match(functionBody('Register-GatewayScheduledTask'), /\$script:GatewayLauncherPath/);
  assert.match(functionBody('Assert-GatewayScheduledTaskContract'), /\$script:GatewayLauncherPath/);
  assert.match(functionBody('Start-GatewayScheduledTask'), /Assert-GatewayScheduledTaskContract/);
  assert.doesNotMatch(functionBody('Assert-RuntimePrerequisites'), /GatewayTaskCredential|Assert-GatewayTaskCredential/);
  for (const body of normalOperationBodies) {
    assert.doesNotMatch(body, /Register-GatewayScheduledTask|GatewayTaskCredential|Assert-GatewayTaskCredential/);
    assert.match(body, /Start-GatewayScheduledTask/);
  }
  assert.doesNotMatch(script, /-LogonType S4U/);
  assert.doesNotMatch(script, /schtasks\.exe[^\r\n]*\/RP\b/i);
  assert.doesNotMatch(script, /Write-(?:Host|Warning|Output)[^\r\n]*\$taskPassword/i);
  assert.match(fixture, /fixtureTaskCredential/);
  assert.match(fixture, /limited Password-logon Task Scheduler principal/);
  assert.doesNotMatch(statusBranch, /GatewayTaskCredential/);
  assert.match(script, /'Deploy' \{[\s\S]*Install-Deployment/);
  assert.match(script, /'CutoverDeploy' \{[\s\S]*Install-Deployment/);
  assert.match(script, /'Rollback' \{[\s\S]*Install-Deployment/);
  assert.match(script, /'RotateGatewayToken' \{[\s\S]*Rotate-GatewayToken/);
  assert.match(script, /'InstallOrUpdateGatewayTask' \{[\s\S]*Install-OrUpdateGatewayTask/);
  assert.match(workflow, /cp deploy\/office\/gateway-launcher\.cjs office-bundle\//);
  assert.doesNotMatch(workflow, /GatewayTaskCredential|RUNNER_TASK_(?:PASSWORD|CREDENTIAL)/i);
});

test('Office artifact verification checks each bundled CLI result before the helper fixture and clears its expected native exit', () => {
  const workflow = read('.github/workflows/office-images.yml');

  assert.match(workflow, /function Assert-BundledCliVersion/);
  assert.match(workflow, /Codex.*0\.149\.1/);
  assert.match(workflow, /Claude.*2\.1\.245/);
  assert.match(workflow, /\$exitCode = \$LASTEXITCODE/);
  assert.match(workflow, /if \(\$exitCode -ne 0\)/);
  assert.match(workflow, /unpacked Windows Job Object helper rejected malformed input incorrectly/);
  assert.match(workflow, /\$global:LASTEXITCODE = 0/);
  assert.ok(
    workflow.indexOf('Assert-BundledCliVersion') < workflow.indexOf('unpacked Windows Job Object helper'),
    'both CLI versions must be verified before the expected helper exit is handled',
  );
});

test('Office Gateway config binds the post-promotion version root, not its temporary extraction directory', () => {
  const script = read('deploy/office/apply-deployment.ps1');

  assert.match(script, /\$runtimeRoot = Join-Path \$releaseRoot 'package'/);
  assert.doesNotMatch(script, /\$runtimeRoot = Join-Path \$candidateRoot 'package'/);
});

test('Office Gateway config is written as UTF-8 without a BOM for Node strict JSON parsing', () => {
  const script = read('deploy/office/apply-deployment.ps1');

  assert.match(script, /System\.Text\.UTF8Encoding.*\$false/);
  assert.match(script, /\[System\.IO\.File\]::WriteAllText\(\$gatewayConfigPath/);
});

test('office MCP v2 readiness is pinned to the API without reaching the worker', () => {
  const serverPackage = JSON.parse(read('apps/server/package.json'));
  const serverEnv = read('apps/server/.env.example');
  const compose = read('deploy/office/compose.office.yml');
  const api = compose.slice(compose.indexOf('  api:'), compose.indexOf('  worker:'));
  const worker = compose.slice(compose.indexOf('  worker:'), compose.indexOf('  web:'));

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
  assert.match(serverEnv, /^MCP_SDK_GENERATION=v2$/m);
  assert.match(serverEnv, /^MCP_PROTOCOL_NEGOTIATION=auto$/m);
  assert.match(api, /MCP_SDK_GENERATION: v2/);
  assert.match(api, /MCP_PROTOCOL_NEGOTIATION: auto/);
  assert.doesNotMatch(worker, /MCP_SDK_GENERATION|MCP_PROTOCOL_NEGOTIATION/);
  assert.doesNotMatch(compose, /^\s*(?:-\s*)?(?:ATTEMPT_MCP_PROTOCOL_MODE|OPERATOR_MCP_MODE)\s*:/m);
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
  assert.doesNotMatch(cutover, /seed-agent-versions\.cli\.js/);
  assert.match(cutover, /npx prisma db push --accept-data-loss && npx prisma generate/);
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
