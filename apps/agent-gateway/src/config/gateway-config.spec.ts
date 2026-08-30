import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('Gateway configuration', () => {
  it('accepts exactly a protected local Gateway config and installation bearer, never an attempt root', async () => {
    const { loadGatewayConfig, readGatewayInstallationToken } = await import('./gateway-config');
    const root = await fixtureRoot();
    const configPath = join(root, 'gateway.json');
    const tokenPath = join(root, 'gateway-token');
    await writeFile(tokenPath, 'A'.repeat(43), { mode: 0o600 });
    await writeFile(configPath, JSON.stringify({
      controlOrigin: 'http://127.0.0.1:4000', tokenFile: tokenPath, stateRoot: join(root, 'state'),
      runtimeRoot: root, workspace: join(root, 'workspace'), loginRoot: root,
    }), { mode: 0o600 });

    const config = await loadGatewayConfig(['--config', configPath]);
    expect(config).toMatchObject({ controlOrigin: 'http://127.0.0.1:4000', tokenFile: tokenPath, stateRoot: join(root, 'state') });
    expect(isAbsolute(config.workspace)).toBe(true);
    await expect(readGatewayInstallationToken(config.tokenFile)).resolves.toBe('A'.repeat(43));
    await expect(loadGatewayConfig(['--config', configPath, '--workspace', '/unsafe'])).rejects.toThrow('gateway_arguments_invalid');
  });

  it('rejects unknown config authority and malformed bearer values', async () => {
    const { loadGatewayConfig, readGatewayInstallationToken } = await import('./gateway-config');
    const root = await fixtureRoot();
    const configPath = join(root, 'gateway.json');
    const tokenPath = join(root, 'gateway-token');
    await writeFile(tokenPath, 'not-a-token');
    await writeFile(configPath, JSON.stringify({
      controlOrigin: 'http://127.0.0.1:4000', tokenFile: tokenPath, stateRoot: join(root, 'state'), runtimeRoot: root,
      workspace: join(root, 'workspace'), attemptRoot: join(root, 'attempts'),
    }));

    await expect(loadGatewayConfig(['--config', configPath])).rejects.toThrow('gateway_config_invalid');
    await expect(readGatewayInstallationToken(tokenPath)).rejects.toThrow('gateway_installation_token_invalid');
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kiditem-gateway-config-'));
  roots.push(root);
  return root;
}
