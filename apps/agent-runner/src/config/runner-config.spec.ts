import { afterEach, describe, expect, it } from 'vitest';
import { lstat, mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRunnerConfig } from './runner-config';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('loadRunnerConfig', () => {
  it('accepts exactly one protected absolute config argument and derives host paths locally', async () => {
    const root = await fixtureRoot();
    const configPath = join(root, 'runner.json');
    const tokenFile = join(root, 'token');
    const attempts = join(root, 'attempts');
    await mkdir(attempts);
    await writeFile(tokenFile, 'A'.repeat(43));
    await writeFile(configPath, JSON.stringify({
      controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot: attempts,
    }));

    const config = await loadRunnerConfig(['--config', configPath], { entrypoint: join(root, 'dist', 'main.cjs') });

    expect(config.controlOrigin).toBe('http://127.0.0.1:4000');
    expect(config.runtimeRoot).toBe(await realpath(root));
    expect(config.loginRoot).toBe(process.env.HOME ?? expect.any(String));
  });

  it('fails closed for extra arguments, non-loopback origin, unknown keys, and symlink paths', async () => {
    const root = await fixtureRoot();
    const target = join(root, 'target.json');
    const configPath = join(root, 'runner.json');
    const tokenFile = join(root, 'token');
    const attempts = join(root, 'attempts');
    await mkdir(attempts); await writeFile(tokenFile, 'A'.repeat(43));
    await writeFile(target, JSON.stringify({ controlOrigin: 'http://localhost:4000', tokenFile, attemptRoot: attempts, extra: true }));
    await symlink(target, configPath);

    await expect(loadRunnerConfig(['--config', configPath, '--other'], { entrypoint: join(root, 'dist', 'main.cjs') })).rejects.toThrow('runner_arguments_invalid');
    await expect(loadRunnerConfig(['--config', configPath], { entrypoint: join(root, 'dist', 'main.cjs') })).rejects.toThrow('runner_config_symlink_rejected');
    expect((await lstat(configPath)).isSymbolicLink()).toBe(true);
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kiditem-runner-config-'));
  roots.push(root);
  await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'dist', 'main.cjs'), '');
  return root;
}
