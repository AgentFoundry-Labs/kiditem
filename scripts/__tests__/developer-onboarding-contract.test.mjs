import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('the recommended local runtime and examples form one reproducible macOS baseline', () => {
  assert.equal(existsSync(resolve(root, '.nvmrc')), true, '.nvmrc must pin the recommended Node runtime');
  assert.equal(read('.nvmrc').trim(), '22.23.2');

  const rootEnv = read('.env.example');
  const serverEnv = read('apps/server/.env.example');
  const agentEnv = read('agents/.env.example');
  assert.match(rootEnv, /^DATABASE_URL=postgresql:\/\/kiditem:kiditem@localhost:5433\/kiditem$/m);
  assert.match(serverEnv, /^DATABASE_URL=postgresql:\/\/kiditem:kiditem@localhost:5433\/kiditem$/m);
  assert.match(rootEnv, /docs\/runbooks\/google-drive-dev-data\.md/);
  assert.doesNotMatch(rootEnv, /import-drive-reference-data\.md/);

  assert.match(serverEnv, /^SOURCING_PLAYWRIGHT_CDP_ENDPOINT=$/m);
  assert.match(serverEnv, /^SOURCING_PLAYWRIGHT_USER_DATA_DIR=\.kiditem\/playwright\/sourcing$/m);
  assert.match(serverEnv, /^SOURCING_PLAYWRIGHT_HEADLESS=true$/m);
  assert.doesNotMatch(serverEnv, /^SOURCING_PLAYWRIGHT_CDP_ENDPOINT=.*kiditem-office:9444/m);

  for (const key of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'VECTORENGINE_API_KEY']) {
    assert.match(agentEnv, new RegExp(`^${key}=$`, 'm'));
  }
  assert.doesNotMatch(agentEnv, /=(?:sk-|AI\.\.\.)/);
});

test('local service images are version-pinned instead of following floating tags', () => {
  const compose = read('docker-compose.yml');
  assert.match(compose, /image:\s*postgres:17\.9/);
  assert.match(compose, /image:\s*minio\/minio:RELEASE\.2025-09-07T16-13-09Z/);
  assert.match(compose, /image:\s*minio\/mc:RELEASE\.2025-08-13T08-35-41Z/);
  assert.doesNotMatch(compose, /image:\s*\S+:latest/);
});

test('the Windows Gateway install gives Prisma postinstall a non-secret local URL', () => {
  const workflow = read('.github/workflows/pr-checks.yml');
  const job = workflow.slice(workflow.indexOf('windows_gateway_package:'));
  assert.match(job, /DATABASE_URL:\s*postgresql:\/\/kiditem:kiditem@127\.0\.0\.1:5433\/kiditem/);
  assert.match(job, /npm ci/);
});

test('root commands keep the optional Python runtime out of the default development path', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts['setup:macos'], 'node scripts/setup-macos-development.mjs');
  assert.match(scripts['dev:core'], /npm run dev/);
  assert.match(scripts['dev:core'], /npm run dev:server/);
  assert.match(scripts['dev:core'], /OPERATION_RUNTIME_WORKER_ENABLED=1/);
  assert.doesNotMatch(scripts['dev:core'], /dev:agents/);
  assert.equal(scripts['dev:all'], 'node scripts/run-local-development.mjs');
  assert.doesNotMatch(scripts['dev:all'], /dev:agents/);
  assert.equal(scripts['gateway:auth:codex'], 'node scripts/local-agent-gateway.mjs auth codex');
  assert.equal(scripts['gateway:login:codex'], 'node scripts/local-agent-gateway.mjs login codex');
  assert.equal(scripts['gateway:login:claude'], 'node scripts/local-agent-gateway.mjs login claude');
  assert.equal(scripts['dev:bootstrap-user'], 'bash bin/bootstrap-local-auth-user.sh');
});

test('README uses the repository setup entrypoint and links the detailed authorities', () => {
  const readme = read('README.md');
  assert.match(readme, /npm run setup:macos/);
  assert.match(readme, /docs\/runbooks\/local-development\.md/);
  assert.match(readme, /docs\/runbooks\/environment-variables\.md/);
  assert.doesNotMatch(readme, /Node\.js\*\* v20\+/);
  assert.doesNotMatch(readme, /MasterProduct\.currentStock/);
  assert.doesNotMatch(readme, /Claude CLI Agent OS/);
});

test('runbooks describe the current browser-auth and environment ownership contracts', () => {
  const index = read('docs/runbooks/README.md');
  const auth = read('docs/runbooks/auth-office-local.md');
  const env = read('docs/runbooks/environment-variables.md');
  assert.match(index, /\[Local Development\]\(local-development\.md\)/);
  assert.match(index, /\[Interaction Platform\]\(interaction-platform\.md\)/);
  assert.match(auth, /HttpOnly `kiditem_session` cookie/);
  assert.match(auth, /GET `\/api\/auth\/me`/);
  assert.match(auth, /POST `\/api\/auth\/extension-handoff`/);
  assert.match(auth, /No Web\/API auth path reads `kiditem\.auth\.session\.v1`/);
  assert.doesNotMatch(auth, /JavaScript-readable/);
  for (const heading of ['macOS core', 'macOS Agent OS', 'Optional Python agents', 'Windows Office']) {
    assert.match(env, new RegExp(heading, 'i'));
  }
});
