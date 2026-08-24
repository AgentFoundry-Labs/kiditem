import { afterEach, describe, expect, it } from 'vitest';
import { chmod, lstat, mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertProtectedPathPolicy, loadRunnerConfig } from './runner-config';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('loadRunnerConfig', () => {
  it('accepts exactly one protected absolute config argument and derives host paths locally', async () => {
    const root = await fixtureRoot();
    const configPath = join(root, 'runner.json');
    const tokenFile = join(root, 'token');
    const attempts = join(root, 'attempts');
    await mkdir(attempts, { mode: 0o700 });
    await writeFile(tokenFile, 'A'.repeat(43), { mode: 0o600 });
    await writeFile(configPath, JSON.stringify({
      controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot: attempts,
    }), { mode: 0o600 });

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

  it('rejects a macOS protected config file that grants group access', async () => {
    const root = await fixtureRoot();
    const configPath = join(root, 'runner.json');
    const tokenFile = join(root, 'token');
    const attempts = join(root, 'attempts');
    await mkdir(attempts, { mode: 0o700 });
    await writeFile(tokenFile, 'A'.repeat(43), { mode: 0o600 });
    await writeFile(configPath, JSON.stringify({ controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot: attempts }), { mode: 0o600 });
    await chmod(configPath, 0o640);

    await expect(loadRunnerConfig(['--config', configPath], { entrypoint: join(root, 'dist', 'main.cjs') })).rejects.toThrow('runner_protected_path_permissions_invalid');
  });

  it('rejects group or other access on the protected token file and private Attempt root', async () => {
    const root = await fixtureRoot();
    const configPath = join(root, 'runner.json');
    const tokenFile = join(root, 'token');
    const attempts = join(root, 'attempts');
    await mkdir(attempts, { mode: 0o700 });
    await writeFile(tokenFile, 'A'.repeat(43), { mode: 0o600 });
    await writeFile(configPath, JSON.stringify({ controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot: attempts }), { mode: 0o600 });

    await chmod(tokenFile, 0o640);
    await expect(loadRunnerConfig(['--config', configPath], { entrypoint: join(root, 'dist', 'main.cjs') })).rejects.toThrow('runner_protected_path_permissions_invalid');

    await chmod(tokenFile, 0o600);
    await chmod(attempts, 0o705);
    await expect(loadRunnerConfig(['--config', configPath], { entrypoint: join(root, 'dist', 'main.cjs') })).rejects.toThrow('runner_protected_path_permissions_invalid');
  });

  it('rejects directly symlinked token and Attempt root paths', async () => {
    const root = await fixtureRoot();
    const configPath = join(root, 'runner.json');
    const tokenTarget = join(root, 'token-target');
    const tokenLink = join(root, 'token');
    const attemptsTarget = join(root, 'attempts-target');
    const attemptsLink = join(root, 'attempts');
    await writeFile(tokenTarget, 'A'.repeat(43), { mode: 0o600 });
    await mkdir(attemptsTarget, { mode: 0o700 });
    await symlink(tokenTarget, tokenLink);
    await writeFile(configPath, JSON.stringify({ controlOrigin: 'http://127.0.0.1:4000', tokenFile: tokenLink, attemptRoot: attemptsTarget }), { mode: 0o600 });

    await expect(loadRunnerConfig(['--config', configPath], { entrypoint: join(root, 'dist', 'main.cjs') })).rejects.toThrow('runner_token_symlink_rejected');

    await symlink(attemptsTarget, attemptsLink);
    await writeFile(configPath, JSON.stringify({ controlOrigin: 'http://127.0.0.1:4000', tokenFile: tokenTarget, attemptRoot: attemptsLink }), { mode: 0o600 });
    await expect(loadRunnerConfig(['--config', configPath], { entrypoint: join(root, 'dist', 'main.cjs') })).rejects.toThrow('runner_attempt_root_symlink_rejected');
  });

  it('fails closed for an injected Windows ACL that grants a protected path to another identity', async () => {
    const root = await fixtureRoot();
    const configPath = join(root, 'runner.json');
    const tokenFile = join(root, 'token');
    const attempts = join(root, 'attempts');
    await mkdir(attempts, { mode: 0o700 });
    await writeFile(tokenFile, 'A'.repeat(43), { mode: 0o600 });
    await writeFile(configPath, JSON.stringify({ controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot: attempts }), { mode: 0o600 });
    const serviceSid = 'S-1-5-80-12345';
    const options = {
      entrypoint: join(root, 'dist', 'main.cjs'),
      protectedPathInspector: {
        platform: 'windows',
        currentServiceIdentity: async () => serviceSid,
        inspect: async (path: string) => ({
          kind: path === attempts ? 'directory' : 'file',
          isSymbolicLink: false,
          windowsAcl: {
            owner: serviceSid,
            entries: [
              { identity: serviceSid, access: 'allow', rights: 'full' },
              { identity: 'BA', access: 'allow', rights: 'full' },
              { identity: 'SY', access: 'allow', rights: 'full' },
              ...(path === tokenFile ? [{ identity: 'WD', access: 'allow', rights: 'read' }] : []),
            ],
          },
        }),
        realpath,
      },
    } as unknown as Parameters<typeof loadRunnerConfig>[1];

    await expect(loadRunnerConfig(['--config', configPath], options)).rejects.toThrow('runner_protected_path_acl_invalid');
  });

  it('accepts a restricted injected Windows ACL without requiring Windows metadata from this macOS fixture', async () => {
    const root = await fixtureRoot();
    const configPath = join(root, 'runner.json');
    const tokenFile = join(root, 'token');
    const attempts = join(root, 'attempts');
    await mkdir(attempts, { mode: 0o700 });
    await writeFile(tokenFile, 'A'.repeat(43), { mode: 0o600 });
    await writeFile(configPath, JSON.stringify({ controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot: attempts }), { mode: 0o600 });
    const serviceSid = 'S-1-5-80-12345';
    const options = {
      entrypoint: join(root, 'dist', 'main.cjs'),
      protectedPathInspector: {
        platform: 'windows',
        currentServiceIdentity: async () => serviceSid,
        inspect: async (path: string) => ({
          kind: path === attempts ? 'directory' : 'file',
          isSymbolicLink: false,
          windowsAcl: {
            owner: serviceSid,
            entries: [
              { identity: serviceSid, access: 'allow', rights: 'full' },
              { identity: 'BA', access: 'allow', rights: 'full' },
              { identity: 'SY', access: 'allow', rights: 'full' },
            ],
          },
        }),
      },
    } as unknown as Parameters<typeof loadRunnerConfig>[1];

    await expect(loadRunnerConfig(['--config', configPath], options)).resolves.toMatchObject({
      tokenFile: await realpath(tokenFile),
      attemptRoot: await realpath(attempts),
    });
  });

  it('rejects a macOS protected path with another owner through the pure policy', () => {
    expect(() => assertProtectedPathPolicy(
      { kind: 'file', isSymbolicLink: false, uid: 502, mode: 0o600 },
      { platform: 'macos', currentUid: 501 },
    )).toThrow('runner_protected_path_owner_invalid');
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kiditem-runner-config-'));
  roots.push(root);
  await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'dist', 'main.cjs'), '');
  return root;
}
