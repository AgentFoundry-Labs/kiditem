import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildLocalGatewayStartCommand,
  buildProviderAuthStatusCommand,
  buildProviderLoginCommand,
  commandSucceeds,
  defaultMacosGatewayConfigPath,
  ensureProviderAuthentication,
  loadLocalGatewayConfig,
} from '../local-agent-gateway.mjs';

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('local Agent Gateway operator commands', () => {
  it('uses the generated Application Support config by default', () => {
    expect(defaultMacosGatewayConfigPath('/Users/example'))
      .toBe('/Users/example/Library/Application Support/KidItem/AgentGateway/gateway-config.json');
  });

  it('loads the strict local config without reading the installation token', async () => {
    const fixture = await gatewayFixture();
    await expect(loadLocalGatewayConfig(fixture.configFile)).resolves.toEqual(fixture.config);

    await writeFile(fixture.configFile, JSON.stringify({ ...fixture.config, executable: '/tmp/shell' }));
    await expect(loadLocalGatewayConfig(fixture.configFile)).rejects.toThrow('gateway_config_invalid');
  });

  it('builds login commands only from bundled provider entrypoints and the isolated login root', async () => {
    const fixture = await gatewayFixture();
    const codex = buildProviderLoginCommand({
      provider: 'codex', config: fixture.config, platform: 'darwin',
      processExecPath: '/usr/local/bin/node', environment: { PATH: '/usr/bin', USER: 'developer' },
    });
    expect(codex).toMatchObject({
      executable: '/usr/local/bin/node',
      args: [join(fixture.runtimeRoot, 'node_modules/@openai/codex/bin/codex.js'), 'login'],
      cwd: fixture.runtimeRoot,
    });
    expect(codex.env).toMatchObject({
      HOME: fixture.loginRoot,
      CODEX_HOME: join(fixture.loginRoot, '.codex'),
      USER: 'developer',
    });
    expect(codex.env).not.toHaveProperty('DATABASE_URL');

    const claude = buildProviderLoginCommand({
      provider: 'claude', config: fixture.config, platform: 'darwin',
      processExecPath: '/usr/local/bin/node', environment: { PATH: '/usr/bin', USER: 'developer' },
    });
    expect(claude.executable).toBe(join(fixture.runtimeRoot, 'node_modules/@anthropic-ai/claude-code/bin/claude.exe'));
    expect(claude.args).toEqual(['auth', 'login']);
    expect(claude.env.HOME).toBe(fixture.loginRoot);
  });

  it('builds provider auth-status commands from the same bundled isolated boundary', async () => {
    const fixture = await gatewayFixture();
    const codex = buildProviderAuthStatusCommand({
      provider: 'codex', config: fixture.config, platform: 'darwin',
      processExecPath: '/usr/local/bin/node', environment: { PATH: '/usr/bin', USER: 'developer' },
    });
    expect(codex).toMatchObject({
      executable: '/usr/local/bin/node',
      args: [join(fixture.runtimeRoot, 'node_modules/@openai/codex/bin/codex.js'), 'login', 'status'],
      cwd: fixture.runtimeRoot,
    });
    expect(codex.env).toMatchObject({
      HOME: fixture.loginRoot,
      CODEX_HOME: join(fixture.loginRoot, '.codex'),
      USER: 'developer',
    });

    const claude = buildProviderAuthStatusCommand({
      provider: 'claude', config: fixture.config, platform: 'darwin',
      processExecPath: '/usr/local/bin/node', environment: { PATH: '/usr/bin', USER: 'developer' },
    });
    expect(claude.args).toEqual(['auth', 'status', '--json']);
  });

  it('bounds noninteractive provider status checks and suppresses their output', () => {
    let received: unknown;
    const result = commandSucceeds({
      executable: '/usr/local/bin/node',
      args: ['provider.js', 'login', 'status'],
      cwd: '/runtime',
      env: { HOME: '/provider-home' },
    }, {
      spawnSyncImpl: (_executable, _args, options) => {
        received = options;
        return { status: 0 } as never;
      },
    });

    expect(result).toBe(true);
    expect(received).toMatchObject({
      cwd: '/runtime',
      env: { HOME: '/provider-home' },
      stdio: 'ignore',
      timeout: 10_000,
      killSignal: 'SIGTERM',
    });
  });

  it.each([
    { error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }), status: null },
    { error: new Error('spawn failed'), status: null },
    { status: null, signal: 'SIGTERM' },
  ])('fails status checks closed on timeout, spawn failure, or signal exit', (spawnResult) => {
    expect(() => commandSucceeds({
      executable: '/usr/local/bin/node',
      args: ['provider.js', 'login', 'status'],
      cwd: '/runtime',
      env: { HOME: '/provider-home' },
    }, {
      spawnSyncImpl: () => spawnResult as never,
    })).toThrow('gateway_provider_status_check_failed');
  });

  it('skips interactive login when the isolated provider home is authenticated', () => {
    const events: string[] = [];

    expect(ensureProviderAuthentication({
      status: () => { events.push('status'); return true; },
      login: () => { events.push('login'); },
      interactive: true,
    })).toEqual({ loginStarted: false });
    expect(events).toEqual(['status']);
  });

  it('runs login once and verifies the isolated provider home afterward', () => {
    const events: string[] = [];

    expect(ensureProviderAuthentication({
      status: () => { events.push('status'); return events.length > 2; },
      login: () => { events.push('login'); },
      interactive: true,
    })).toEqual({ loginStarted: true });
    expect(events).toEqual(['status', 'login', 'status']);
  });

  it('fails closed without launching login from a non-interactive start check', () => {
    expect(() => ensureProviderAuthentication({
      status: () => false,
      login: () => { throw new Error('login_must_not_run'); },
      interactive: false,
    })).toThrow('gateway_provider_unauthenticated');
  });

  it('fails authentication when login does not produce a valid isolated session', () => {
    expect(() => ensureProviderAuthentication({
      status: () => false,
      login: () => undefined,
      interactive: true,
    })).toThrow('gateway_provider_auth_failed');
  });

  it('starts only the built Gateway entrypoint with the selected protected config', async () => {
    const fixture = await gatewayFixture();
    expect(buildLocalGatewayStartCommand({ configFile: fixture.configFile, config: fixture.config, processExecPath: '/usr/local/bin/node' }))
      .toEqual({
        executable: '/usr/local/bin/node',
        args: [join(fixture.runtimeRoot, 'apps/agent-gateway/dist/main.cjs'), '--config', fixture.configFile],
        cwd: fixture.runtimeRoot,
        env: expect.any(Object),
      });
  });
});

async function gatewayFixture() {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'kiditem-gateway-runtime-'));
  roots.push(runtimeRoot);
  const loginRoot = join(runtimeRoot, 'provider-home');
  const stateRoot = join(runtimeRoot, 'state');
  const tokenFile = join(runtimeRoot, 'secrets/installation-token');
  const configFile = join(runtimeRoot, 'gateway-config.json');
  await mkdir(join(runtimeRoot, 'node_modules/@openai/codex/bin'), { recursive: true });
  await mkdir(join(runtimeRoot, 'node_modules/@anthropic-ai/claude-code/bin'), { recursive: true });
  await mkdir(join(runtimeRoot, 'apps/agent-gateway/dist'), { recursive: true });
  await mkdir(loginRoot, { recursive: true });
  await writeFile(join(runtimeRoot, 'node_modules/@openai/codex/bin/codex.js'), '');
  await writeFile(join(runtimeRoot, 'node_modules/@anthropic-ai/claude-code/bin/claude.exe'), '');
  await writeFile(join(runtimeRoot, 'apps/agent-gateway/dist/main.cjs'), '');
  await mkdir(join(runtimeRoot, 'secrets'), { recursive: true });
  await writeFile(tokenFile, 'A'.repeat(43));
  const config = {
    controlOrigin: 'http://127.0.0.1:4000', tokenFile, stateRoot,
    runtimeRoot, workspace: runtimeRoot, loginRoot,
  };
  await writeFile(configFile, JSON.stringify(config));
  return { configFile, config, runtimeRoot, loginRoot };
}
