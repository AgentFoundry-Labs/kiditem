import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRunnerConfig } from './runner-config';

describe('Windows Office protected-path admission', () => {
  it.skipIf(process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true')(
    'accepts a deployment-owned KidItem anchor below a normal ProgramData parent ACL',
    async () => {
      const programData = process.env.ProgramData ?? 'C:\\ProgramData';
      const anchor = join(programData, 'KidItem');
      if (existsSync(anchor)) throw new Error('Windows CI must reserve a clean ProgramData\\KidItem anchor for this live ACL fixture.');
      const release = join(anchor, 'agent-runner', 'releases', 'a'.repeat(40));
      const runtimeRoot = join(release, 'package');
      const entrypoint = join(runtimeRoot, 'dist', 'main.cjs');
      const configPath = join(release, 'runner-config.json');
      const tokenFile = join(anchor, 'secrets', 'agent-runner-token');
      const attemptRoot = join(anchor, 'agent-runner', 'attempts');
      const account = execFileSync('whoami.exe', [], { encoding: 'utf8' }).trim();
      try {
        await mkdir(join(runtimeRoot, 'dist'), { recursive: true });
        await mkdir(attemptRoot, { recursive: true });
        await mkdir(join(anchor, 'secrets'), { recursive: true });
        await writeFile(entrypoint, '');
        await writeFile(tokenFile, 'A'.repeat(43));
        await writeFile(configPath, JSON.stringify({
          controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot, runtimeRoot,
        }));

        protect(anchor, account, 'RX', true, false);
        for (const path of [
          join(anchor, 'agent-runner'),
          join(anchor, 'agent-runner', 'releases'),
          release,
          runtimeRoot,
          join(runtimeRoot, 'dist'),
        ]) protect(path, account, 'RX', true);
        protect(attemptRoot, account, 'F', true);
        protect(join(anchor, 'secrets'), account, 'R', true);
        protect(configPath, account, 'R', false);
        protect(tokenFile, account, 'R', false);
        protect(attemptRoot, account, 'F', true);
        protect(runtimeRoot, account, 'RX', true);

        await expect(loadRunnerConfig(['--config', configPath], { entrypoint })).resolves.toMatchObject({
          controlOrigin: 'http://127.0.0.1:4000',
          tokenFile,
          attemptRoot,
          runtimeRoot,
        });

        // A junction has a canonical-looking descendant spelling but escapes
        // the protected root. It must be rejected before any Attempt workspace
        // can be created beneath it.
        const outsideRoot = await mkdtemp(join(tmpdir(), 'kiditem-runner-junction-target-'));
        try {
          await rm(attemptRoot, { recursive: true, force: true });
          execFileSync('cmd.exe', ['/d', '/s', '/c', `mklink /J "${attemptRoot}" "${outsideRoot}"`], { stdio: 'pipe' });
          await expect(loadRunnerConfig(['--config', configPath], { entrypoint }))
            .rejects.toThrow('runner_attempt_root_symlink_rejected');
        } finally {
          await rm(outsideRoot, { recursive: true, force: true });
        }
      } finally {
        await rm(anchor, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true')(
    'rejects a protected config outside the code-owned ProgramData KidItem anchor',
    async () => {
      const outsideRoot = await mkdtemp(join(tmpdir(), 'kiditem-runner-outside-anchor-'));
      const configPath = join(outsideRoot, 'runner-config.json');
      try {
        await writeFile(configPath, '{}');
        await expect(loadRunnerConfig(['--config', configPath], {
          entrypoint: join(outsideRoot, 'package', 'dist', 'main.cjs'),
        })).rejects.toThrow('runner_protected_path_anchor_invalid');
      } finally {
        await rm(outsideRoot, { recursive: true, force: true });
      }
    },
  );
});

function protect(
  path: string,
  account: string,
  rights: 'R' | 'RX' | 'F',
  directory: boolean,
  inheritAccount = true,
): void {
  const inherited = directory ? '(OI)(CI)' : '';
  const accountInheritance = directory && inheritAccount ? '(OI)(CI)' : '';
  execFileSync('icacls.exe', [path, '/setowner', 'Administrators'], { stdio: 'pipe' });
  execFileSync('icacls.exe', [
    path,
    '/inheritance:r',
    '/grant:r',
    `${account}:${accountInheritance}${rights}`,
    `SYSTEM:${inherited}${rights}`,
    `Administrators:${directory ? '(OI)(CI)' : ''}F`,
    '/remove:g', 'Users', 'Authenticated Users', 'Everyone',
  ], { stdio: 'pipe' });
}
