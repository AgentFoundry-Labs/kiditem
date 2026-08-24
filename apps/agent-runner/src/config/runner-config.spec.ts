import { afterEach, describe, expect, it } from 'vitest';
import { chmod, link, lstat, mkdtemp, mkdir, open, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { assertProtectedPathPolicy, loadRunnerConfig, readInstallationToken } from './runner-config';

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
      controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot: attempts, runtimeRoot: root,
    }), { mode: 0o600 });

    const config = await loadRunnerConfig(['--config', configPath], fixtureMacosOptions(root, [configPath, tokenFile, attempts]));

    expect(config.controlOrigin).toBe('http://127.0.0.1:4000');
    expect(config.runtimeRoot).toBe(await realpath(root));
    expect(config.loginRoot).toBe(process.env.HOME ?? expect.any(String));
  });

  it('requires the configured versioned Runner root to match the launched artifact', async () => {
    const root = await fixtureRoot();
    const configPath = join(root, 'runner.json');
    const tokenFile = join(root, 'token');
    const attempts = join(root, 'attempts');
    const anotherRuntimeRoot = join(root, 'another-runner');
    await mkdir(attempts, { mode: 0o700 });
    await mkdir(anotherRuntimeRoot, { mode: 0o700 });
    await writeFile(tokenFile, 'A'.repeat(43), { mode: 0o600 });
    await writeFile(configPath, JSON.stringify({
      controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot: attempts, runtimeRoot: anotherRuntimeRoot,
    }), { mode: 0o600 });

    await expect(loadRunnerConfig(
      ['--config', configPath],
      fixtureMacosOptions(root, [configPath, tokenFile, attempts, anotherRuntimeRoot]),
    )).rejects.toThrow('runner_runtime_root_mismatch');
  });

  it('accepts Windows read-only token/config ACLs, executable runtime roots, and writable attempt roots', () => {
    const serviceSid = 'S-1-5-80-12345';
    const policy = { platform: 'windows' as const, currentServiceIdentity: serviceSid };
    const readTarget = {
      kind: 'file' as const,
      isSymbolicLink: false,
      windowsAcl: {
        owner: 'BA',
        entries: [
          { identity: serviceSid, access: 'allow' as const, rights: 'read' as const },
          { identity: 'SY', access: 'allow' as const, rights: 'read' as const },
          { identity: 'BA', access: 'allow' as const, rights: 'full' as const },
        ],
      },
    };

    expect(() => assertProtectedPathPolicy(readTarget, policy, 'read')).not.toThrow();
    expect(() => assertProtectedPathPolicy(readTarget, policy, 'write')).toThrow('runner_protected_path_acl_invalid');
  });

  it('fails closed for extra arguments, non-loopback origin, unknown keys, and symlink paths', async () => {
    const root = await fixtureRoot();
    const target = join(root, 'target.json');
    const configPath = join(root, 'runner.json');
    const tokenFile = join(root, 'token');
    const attempts = join(root, 'attempts');
    await mkdir(attempts); await writeFile(tokenFile, 'A'.repeat(43));
    await writeFile(target, JSON.stringify({ controlOrigin: 'http://localhost:4000', tokenFile, attemptRoot: attempts, runtimeRoot: root, extra: true }));
    await symlink(target, configPath);

    const options = fixtureMacosOptions(root, [configPath, tokenFile, attempts]);
    await expect(loadRunnerConfig(['--config', configPath, '--other'], options)).rejects.toThrow('runner_arguments_invalid');
    await expect(loadRunnerConfig(['--config', configPath], options)).rejects.toThrow('runner_config_symlink_rejected');
    expect((await lstat(configPath)).isSymbolicLink()).toBe(true);
  });

  it('rejects a macOS protected config file that grants group access', async () => {
    const root = await fixtureRoot();
    const configPath = join(root, 'runner.json');
    const tokenFile = join(root, 'token');
    const attempts = join(root, 'attempts');
    await mkdir(attempts, { mode: 0o700 });
    await writeFile(tokenFile, 'A'.repeat(43), { mode: 0o600 });
    await writeFile(configPath, JSON.stringify({ controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot: attempts, runtimeRoot: root }), { mode: 0o600 });
    await chmod(configPath, 0o640);

    await expect(loadRunnerConfig(['--config', configPath], fixtureMacosOptions(root, [configPath, tokenFile, attempts]))).rejects.toThrow('runner_protected_path_permissions_invalid');
  });

  it('rejects group or other access on the protected token file and private Attempt root', async () => {
    const root = await fixtureRoot();
    const configPath = join(root, 'runner.json');
    const tokenFile = join(root, 'token');
    const attempts = join(root, 'attempts');
    await mkdir(attempts, { mode: 0o700 });
    await writeFile(tokenFile, 'A'.repeat(43), { mode: 0o600 });
    await writeFile(configPath, JSON.stringify({ controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot: attempts, runtimeRoot: root }), { mode: 0o600 });

    await chmod(tokenFile, 0o640);
    await expect(loadRunnerConfig(['--config', configPath], fixtureMacosOptions(root, [configPath, tokenFile, attempts]))).rejects.toThrow('runner_protected_path_permissions_invalid');

    await chmod(tokenFile, 0o600);
    await chmod(attempts, 0o705);
    await expect(loadRunnerConfig(['--config', configPath], fixtureMacosOptions(root, [configPath, tokenFile, attempts]))).rejects.toThrow('runner_protected_path_permissions_invalid');
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
    await writeFile(configPath, JSON.stringify({ controlOrigin: 'http://127.0.0.1:4000', tokenFile: tokenLink, attemptRoot: attemptsTarget, runtimeRoot: root }), { mode: 0o600 });

    await expect(loadRunnerConfig(['--config', configPath], fixtureMacosOptions(root, [configPath, tokenLink, attemptsTarget]))).rejects.toThrow('runner_token_symlink_rejected');

    await symlink(attemptsTarget, attemptsLink);
    await writeFile(configPath, JSON.stringify({ controlOrigin: 'http://127.0.0.1:4000', tokenFile: tokenTarget, attemptRoot: attemptsLink, runtimeRoot: root }), { mode: 0o600 });
    await expect(loadRunnerConfig(['--config', configPath], fixtureMacosOptions(root, [configPath, tokenTarget, attemptsLink]))).rejects.toThrow('runner_attempt_root_symlink_rejected');
  });

  it('rejects a config pathname replaced with a symlink after its protected metadata was inspected', async () => {
    const root = await fixtureRoot();
    const configPath = join(root, 'runner.json');
    const replacement = join(root, 'replacement.json');
    const tokenFile = join(root, 'token');
    const attempts = join(root, 'attempts');
    await mkdir(attempts, { mode: 0o700 });
    await writeFile(tokenFile, 'A'.repeat(43), { mode: 0o600 });
    await writeFile(configPath, JSON.stringify({ controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot: attempts, runtimeRoot: root }), { mode: 0o600 });
    await link(configPath, replacement);
    let swapped = false;
    const protectedPathInspector = fixtureMacosInspector([configPath, tokenFile, attempts], async (path) => {
      if (path === configPath && !swapped) {
        swapped = true;
        await rm(configPath);
        await symlink(replacement, configPath);
      }
    });

    await expect(loadRunnerConfig(['--config', configPath], {
      entrypoint: join(root, 'dist', 'main.cjs'),
      protectedPathInspector,
    })).rejects.toThrow('runner_protected_path_changed');
  });

  it('rejects a config whose verified ancestor is replaced before its descriptor is opened', async () => {
    const root = await fixtureRoot();
    const protectedParent = join(root, 'protected');
    const movedParent = join(root, 'protected-original');
    const attackerParent = join(root, 'attacker');
    const configPath = join(protectedParent, 'runner.json');
    const replacement = join(attackerParent, 'runner.json');
    const tokenFile = join(protectedParent, 'token');
    const attempts = join(protectedParent, 'attempts');
    await mkdir(protectedParent, { mode: 0o700 });
    await mkdir(attackerParent, { mode: 0o700 });
    await mkdir(attempts, { mode: 0o700 });
    await writeFile(tokenFile, 'A'.repeat(43), { mode: 0o600 });
    await writeFile(configPath, JSON.stringify({ controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot: attempts, runtimeRoot: root }), { mode: 0o600 });
    await link(configPath, replacement);
    let swapped = false;
    const options = {
      entrypoint: join(root, 'dist', 'main.cjs'),
      protectedPathInspector: fixtureMacosInspector([configPath, tokenFile, attempts]),
      protectedPathFilesystem: {
        openReadOnly: async (path: string) => {
          if (path === configPath && !swapped) {
            swapped = true;
            await rename(protectedParent, movedParent);
            await symlink(attackerParent, protectedParent);
          }
          return open(path, 'r');
        },
      },
    } as unknown as Parameters<typeof loadRunnerConfig>[1];

    await expect(loadRunnerConfig(['--config', configPath], options)).rejects.toThrow('runner_protected_path_changed');
    expect(swapped).toBe(true);
  });

  it('rejects an installation token pathname replaced before its verified descriptor is read', async () => {
    const root = await fixtureRoot();
    const tokenFile = join(root, 'token');
    const replacement = join(root, 'replacement-token');
    await writeFile(tokenFile, 'A'.repeat(43), { mode: 0o600 });
    await writeFile(replacement, 'B'.repeat(43), { mode: 0o600 });
    let swapped = false;
    await expect(readInstallationToken(tokenFile, {
      protectedPathInspector: fixtureMacosInspector([tokenFile]),
      protectedPathFilesystem: {
        openReadOnly: async (path: string) => {
          if (path === tokenFile && !swapped) {
            swapped = true;
            await rm(tokenFile);
            await symlink(replacement, tokenFile);
          }
          return open(path, 'r');
        },
      },
    })).rejects.toThrow('runner_protected_path_changed');
    expect(swapped).toBe(true);
  });

  it('fails closed for an injected Windows ACL that grants a protected path to another identity', async () => {
    const root = await fixtureRoot();
    const configPath = join(root, 'runner.json');
    const tokenFile = join(root, 'token');
    const attempts = join(root, 'attempts');
    await mkdir(attempts, { mode: 0o700 });
    await writeFile(tokenFile, 'A'.repeat(43), { mode: 0o600 });
    await writeFile(configPath, JSON.stringify({ controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot: attempts, runtimeRoot: root }), { mode: 0o600 });
    const serviceSid = 'S-1-5-80-12345';
    const options = {
      entrypoint: join(root, 'dist', 'main.cjs'),
      protectedPathInspector: fixtureWindowsInspector(serviceSid, {
        readPaths: [configPath, tokenFile],
        readExecutePaths: [root],
        writePaths: [attempts],
        extraEntries: (path) => (
          path === tokenFile ? [{ identity: 'WD', access: 'allow', rights: 'other' as const }] : []
        ),
      }),
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
    await writeFile(configPath, JSON.stringify({ controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot: attempts, runtimeRoot: root }), { mode: 0o600 });
    const serviceSid = 'S-1-5-80-12345';
    const options = {
      entrypoint: join(root, 'dist', 'main.cjs'),
      protectedPathInspector: fixtureWindowsInspector(serviceSid, {
        readPaths: [configPath, tokenFile],
        readExecutePaths: [root],
        writePaths: [attempts],
      }),
    } as unknown as Parameters<typeof loadRunnerConfig>[1];

    await expect(loadRunnerConfig(['--config', configPath], options)).resolves.toMatchObject({
      tokenFile: resolve(tokenFile),
      attemptRoot: resolve(attempts),
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

function fixtureMacosOptions(root: string, protectedPaths: readonly string[]) {
  return {
    entrypoint: join(root, 'dist', 'main.cjs'),
    protectedPathInspector: fixtureMacosInspector(protectedPaths),
  };
}

function fixtureMacosInspector(
  protectedPaths: readonly string[] = [],
  afterInspect?: (path: string) => Promise<void>,
) {
  const uid = process.getuid?.();
  const protectedPathSet = new Set(protectedPaths.map((path) => resolve(path)));
  return {
    platform: 'macos' as const,
    currentUid: () => uid,
    inspect: async (path: string) => {
      const info = await lstat(path).catch(() => null);
      if (!info) return null;
      const protectedPath = protectedPathSet.has(resolve(path));
      const inspection = {
        kind: protectedPath
          ? info.isDirectory() ? 'directory' as const : info.isFile() ? 'file' as const : 'other' as const
          : 'directory' as const,
        isSymbolicLink: protectedPath && info.isSymbolicLink(),
        uid: protectedPath ? info.uid : uid,
        mode: protectedPath ? info.mode : 0o700,
        identity: { device: String(info.dev), inode: String(info.ino) },
      };
      await afterInspect?.(path);
      return inspection;
    },
  };
}

function fixtureWindowsInspector(
  serviceSid: string,
  options: Readonly<{
    readPaths?: readonly string[];
    readExecutePaths?: readonly string[];
    writePaths?: readonly string[];
    extraEntries?: (path: string) => readonly { identity: string; access: 'allow'; rights: 'full' | 'read' | 'read_execute' | 'write' | 'other' }[];
  }> = {},
) {
  const readPaths = new Set((options.readPaths ?? []).map((path) => resolve(path)));
  const readExecutePaths = new Set((options.readExecutePaths ?? []).map((path) => resolve(path)));
  const writePaths = new Set((options.writePaths ?? []).map((path) => resolve(path)));
  return {
    platform: 'windows' as const,
    currentServiceIdentity: async () => serviceSid,
    inspect: async (path: string) => {
      const info = await lstat(path).catch(() => null);
      if (!info) return null;
      const normalizedPath = resolve(path);
      const rights = readPaths.has(normalizedPath)
        ? 'read' as const
        : readExecutePaths.has(normalizedPath)
          ? 'read_execute' as const
          : writePaths.has(normalizedPath)
            ? 'full' as const
            : 'full' as const;
      return {
        kind: info.isFile() ? 'file' as const : 'directory' as const,
        isSymbolicLink: false,
        identity: { device: String(info.dev), inode: String(info.ino) },
        windowsAcl: {
          owner: serviceSid,
          entries: [
            { identity: serviceSid, access: 'allow' as const, rights },
            { identity: 'BA', access: 'allow' as const, rights: 'full' as const },
            { identity: 'SY', access: 'allow' as const, rights },
            ...(options.extraEntries?.(path) ?? []),
          ],
        },
      };
    },
  };
}
