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
  assert.equal(compose.match(/external: true/g)?.length, 2);
  assert.doesNotMatch(compose, /SUPABASE_URL|NEXT_PUBLIC_SUPABASE/);
  assert.doesNotMatch(envExample, /SUPABASE_URL|NEXT_PUBLIC_SUPABASE/);
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

test('office API runtime owns installed local CLIs and persistent service-account profiles', () => {
  const serverPackage = JSON.parse(read('apps/server/package.json'));
  const dockerfile = read('apps/server/Dockerfile');
  const compose = read('deploy/office/compose.office.yml');

  assert.equal(typeof serverPackage.dependencies['@openai/codex'], 'string');
  assert.equal(typeof serverPackage.dependencies['@anthropic-ai/claude-code'], 'string');
  assert.match(dockerfile, /ENV PATH=\/app\/apps\/server\/node_modules\/\.bin:\/app\/node_modules\/\.bin:/);
  assert.match(dockerfile, /codex --version/);
  assert.match(dockerfile, /claude --version/);
  assert.match(dockerfile, /COPY agent-config \.\/agent-config/);
  assert.match(dockerfile, /FilesystemAgentRuntimeManifestCatalog/);
  assert.match(dockerfile, /kiditem-agent-os-mcp-server\.js/);
  assert.doesNotMatch(
    dockerfile,
    /COPY agent-config\/prompts\/agents\/sourcing\.md/,
  );
  assert.match(compose, /HOME: \/var\/lib\/kiditem-cli/);
  assert.match(compose, /CODEX_HOME: \/var\/lib\/kiditem-cli\/\.codex/);
  assert.match(compose, /CLAUDE_CONFIG_DIR: \/var\/lib\/kiditem-cli\/\.claude/);
  assert.match(compose, /kiditem-cli-home:\/var\/lib\/kiditem-cli/);
  assert.doesNotMatch(compose, /kiditem-agent-runs:\/var\/lib\/kiditem-agent-runs/);
  assert.match(compose, /cli-login:/);
  assert.match(compose, /profiles:\s*\["cli-login"\]/);
  assert.match(compose, /command: \["codex", "login", "status"\]/);
  assert.doesNotMatch(compose, /OPENAI_API_KEY|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN/);
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
