import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertMacosDevelopmentRuntime,
  setupMacosDevelopmentFiles,
} from '../setup-macos-development.mjs';

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('macOS development setup', () => {
  it('requires macOS', () => {
    expect(() => assertMacosDevelopmentRuntime({ platform: 'linux', nodeVersion: '22.23.2' }))
      .toThrow('setup_macos_platform_required');
  });

  it.each(['22.22.3', '22.23.1', '22.23.2', '22.99.0'])(
    'accepts supported Node 22 version %s independently of the recommended patch',
    (nodeVersion) => {
      expect(() => assertMacosDevelopmentRuntime({ platform: 'darwin', nodeVersion }))
        .not.toThrow();
    },
  );

  it.each(['21.99.0', '22.0.0', '22.21.99', '22.22.2', '22.23', '22.23.2-rc.1', '23.0.0', 'invalid'])(
    'rejects unsupported Node version %s',
    (nodeVersion) => {
      expect(() => assertMacosDevelopmentRuntime({ platform: 'darwin', nodeVersion }))
        .toThrow('setup_node_version_mismatch');
    },
  );

  it('creates only missing env files and an isolated protected Gateway home', async () => {
    const repoRoot = await fixtureRepo();
    const home = await tempRoot('kiditem-setup-home-');
    await writeFile(join(repoRoot, '.env'), 'PRESERVE_ME=1\n');

    const result = await setupMacosDevelopmentFiles({ repoRoot, home });

    expect(await readFile(join(repoRoot, '.env'), 'utf8')).toBe('PRESERVE_ME=1\n');
    expect(await readFile(join(repoRoot, 'apps/server/.env'), 'utf8'))
      .toContain('KIDITEM_AGENT_GATEWAY_TOKEN_FILE="');
    expect(await readFile(join(repoRoot, 'apps/web/.env.local'), 'utf8'))
      .toContain('NEXT_PUBLIC_API_URL=http://localhost:4000');
    await expect(readFile(join(repoRoot, 'agents/.env'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    expect(result.gateway.root).toBe(join(home, 'Library/Application Support/KidItem/AgentGateway'));
    expect(result.gateway.loginRoot).toBe(join(result.gateway.root, 'provider-home'));
    expect(result.gateway.loginRoot).not.toBe(home);
    const config = JSON.parse(await readFile(result.gateway.configFile, 'utf8'));
    expect(config).toEqual({
      controlOrigin: 'http://127.0.0.1:4000',
      tokenFile: result.gateway.tokenFile,
      stateRoot: result.gateway.stateRoot,
      runtimeRoot: repoRoot,
      workspace: repoRoot,
      loginRoot: result.gateway.loginRoot,
    });
    expect((await readFile(result.gateway.tokenFile, 'utf8')).trim()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await stat(result.gateway.root)).mode & 0o777).toBe(0o700);
    expect((await stat(result.gateway.stateRoot)).mode & 0o777).toBe(0o700);
    expect((await stat(result.gateway.loginRoot)).mode & 0o777).toBe(0o700);
    expect((await stat(result.gateway.configFile)).mode & 0o777).toBe(0o600);
    expect((await stat(result.gateway.tokenFile)).mode & 0o777).toBe(0o600);
    expect((await stat(join(repoRoot, 'apps/server/.env'))).mode & 0o777).toBe(0o600);
    expect((await stat(join(repoRoot, 'apps/web/.env.local'))).mode & 0o777).toBe(0o600);
  });

  it('creates a protected Codex home inside the isolated Gateway login root', async () => {
    const repoRoot = await fixtureRepo();
    const home = await tempRoot('kiditem-setup-home-');

    const result = await setupMacosDevelopmentFiles({ repoRoot, home });
    const codexHome = join(result.gateway.loginRoot, '.codex');

    expect((await stat(codexHome)).isDirectory()).toBe(true);
    expect((await stat(codexHome)).mode & 0o777).toBe(0o700);
  });

  it('preserves a valid token and remains idempotent while refreshing absolute repo paths', async () => {
    const repoRoot = await fixtureRepo();
    const home = await tempRoot('kiditem-setup-home-');
    const first = await setupMacosDevelopmentFiles({ repoRoot, home, includePythonAgents: true });
    const token = await readFile(first.gateway.tokenFile, 'utf8');
    const serverEnv = await readFile(join(repoRoot, 'apps/server/.env'), 'utf8');

    const second = await setupMacosDevelopmentFiles({ repoRoot, home, includePythonAgents: true });

    expect(await readFile(second.gateway.tokenFile, 'utf8')).toBe(token);
    expect(await readFile(join(repoRoot, 'apps/server/.env'), 'utf8')).toBe(serverEnv);
    expect(await readFile(join(repoRoot, 'agents/.env'), 'utf8')).toContain('AI_MODE=proxy');
  });

  it('blocks malformed existing control material instead of rotating it', async () => {
    const repoRoot = await fixtureRepo();
    const home = await tempRoot('kiditem-setup-home-');
    const tokenFile = join(home, 'Library/Application Support/KidItem/AgentGateway/secrets/installation-token');
    await mkdir(join(tokenFile, '..'), { recursive: true });
    await writeFile(tokenFile, 'bad-token');

    await expect(setupMacosDevelopmentFiles({ repoRoot, home }))
      .rejects.toThrow('gateway_installation_token_invalid');
    expect(await readFile(tokenFile, 'utf8')).toBe('bad-token');
  });
});

async function fixtureRepo(): Promise<string> {
  const root = await tempRoot('kiditem-setup-repo-');
  await mkdir(join(root, 'apps/server'), { recursive: true });
  await mkdir(join(root, 'apps/web'), { recursive: true });
  await mkdir(join(root, 'agents'), { recursive: true });
  await writeFile(join(root, '.env.example'), 'DATABASE_URL=postgresql://local\n');
  await writeFile(join(root, 'apps/server/.env.example'), 'KIDITEM_AGENT_GATEWAY_TOKEN_FILE=\n');
  await writeFile(join(root, 'apps/web/.env.example'), 'NEXT_PUBLIC_API_URL=http://localhost:4000\n');
  await writeFile(join(root, 'agents/.env.example'), 'AI_MODE=proxy\n');
  return root;
}

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}
