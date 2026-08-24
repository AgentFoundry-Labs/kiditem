import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexAttemptIsolationCanary } from './codex-attempt-isolation-canary';
import { AttemptFilesystemService } from './attempt-filesystem.service';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('CodexAttemptIsolationCanary', () => {
  it('fails closed unless the pinned Codex profile allows only the Attempt workspace and rejects auth, source, and network shell access', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiditem-codex-isolation-')); roots.push(root);
    const login = await mkdtemp(join(tmpdir(), 'kiditem-codex-login-')); roots.push(login);
    await mkdir(join(login, '.codex'));
    await writeFile(join(login, '.codex', 'auth.json'), 'must-not-be-readable');
    const files = new AttemptFilesystemService(root);
    const execute = vi.fn(async (_command: string, args: readonly string[]) => {
      const shell = String(args.at(-1));
      if (shell.includes('attempt-workspace-ok')) return { stdout: '', stderr: '' };
      const error = Object.assign(new Error('permission denied'), { code: 1, stdout: '', stderr: 'permission denied' });
      throw error;
    });
    const canary = new CodexAttemptIsolationCanary(files, execute as never);

    await expect(canary.run({ loginHome: login })).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(4);
    for (const [, args] of execute.mock.calls) {
      expect(args).toEqual(expect.arrayContaining(['sandbox', '--cd']));
      expect(args).toEqual(expect.arrayContaining(['-P', 'kiditem_attempt']));
      expect(args).not.toEqual(expect.arrayContaining(['--sandbox']));
    }
  });
});
