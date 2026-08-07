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
