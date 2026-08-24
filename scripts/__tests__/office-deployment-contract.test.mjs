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

test('office API runtime alone owns installed local CLIs and a read-only service-account profile', () => {
  const serverPackage = JSON.parse(read('apps/server/package.json'));
  const dockerfile = read('apps/server/Dockerfile');
  const compose = read('deploy/office/compose.office.yml');

  assert.equal(typeof serverPackage.dependencies['@openai/codex'], 'string');
  assert.equal(typeof serverPackage.dependencies['@anthropic-ai/claude-code'], 'string');
  assert.match(dockerfile, /ENV PATH=\/app\/apps\/server\/node_modules\/\.bin:\/app\/node_modules\/\.bin:/);
  assert.match(dockerfile, /codex --version/);
  assert.match(dockerfile, /claude --version/);
  assert.match(dockerfile, /COPY agent-config \.\/agent-config/);
  assert.match(dockerfile, /readiness-canary-mcp-server\.js/);
  assert.match(dockerfile, /kiditem-agent-os-mcp-server\.js/);
  assert.doesNotMatch(
    dockerfile,
    /COPY agent-config\/prompts\/agents\/sourcing\.md/,
  );
  assert.match(compose, /KIDITEM_ATTEMPT_LOGIN_HOME: \/var\/lib\/kiditem-cli/);
  assert.match(compose, /kiditem-cli-home:\/var\/lib\/kiditem-cli:ro/);
  assert.match(compose, /AGENT_CLI_MAX_CONCURRENCY: \$\{AGENT_CLI_MAX_CONCURRENCY:-4\}/);
  for (const key of ['OPERATOR', 'SOURCING', 'MERCHANDISING', 'SUPPLY', 'CHANNEL_OPERATIONS', 'ADVERTISING']) {
    assert.match(compose, new RegExp('AGENT_' + key + '_MODEL: \\$\\{AGENT_' + key + '_MODEL:\\?'));
  }
  assert.doesNotMatch(compose, /kiditem-agent-runs:\/var\/lib\/kiditem-agent-runs/);
  assert.match(compose, /cli-login:/);
  assert.match(compose, /profiles:\s*\["cli-login"\]/);
  assert.match(compose, /command: \["codex", "login", "status"\]/);
  assert.doesNotMatch(compose, /OPENAI_API_KEY|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN/);
  const worker = compose.slice(compose.indexOf('  worker:'), compose.indexOf('  web:'));
  assert.doesNotMatch(worker, /(?:HOME|CODEX_HOME|CLAUDE_CONFIG_DIR|KIDITEM_ATTEMPT_LOGIN_HOME|kiditem-cli-home)/);
  const runbook = read('docs/runbooks/office-deploy.md');
  assert.match(runbook, /docker compose run --rm --no-deps cli-login codex login --device-auth/);
  assert.match(runbook, /docker compose run --rm --no-deps cli-login claude auth login/);
  assert.doesNotMatch(runbook, /docker exec[^\n]*(codex|claude)/i);
});

test('office cli-login profile resolves with only its non-secret CLI-home environment', () => {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '--profile', 'cli-login',
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
  const cliLogin = JSON.parse(result.stdout).services['cli-login'];
  assert.deepEqual(Object.keys(cliLogin.environment).sort(), [
    'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'DISABLE_AUTOUPDATER', 'HOME',
  ]);
  for (const key of [
    'DATABASE_URL', 'DIRECT_URL', 'S3_ACCESS_KEY', 'S3_SECRET_KEY',
    'SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'CHANNEL_CREDENTIALS_ENCRYPTION_KEY',
  ]) assert.equal(cliLogin.environment[key], undefined, `cli-login leaked ${key}`);
  assert.deepEqual(cliLogin.volumes, [
    { type: 'volume', source: 'kiditem-cli-home', target: '/var/lib/kiditem-cli', volume: {} },
  ]);
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
