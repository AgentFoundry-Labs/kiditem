import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, symlink, writeFile, rm, stat, readlink, lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AttemptFilesystemService } from './attempt-filesystem.service';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('AttemptFilesystemService.cleanAttempt', () => {
  it('creates empty per-Attempt provider homes and links—not copies—the single auth artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiditem-attempt-auth-')); roots.push(root);
    const login = await mkdtemp(join(tmpdir(), 'kiditem-login-')); roots.push(login);
    await mkdir(join(login, '.codex')); await mkdir(join(login, '.claude'));
    await writeFile(join(login, '.codex', 'auth.json'), 'credential-not-read');
    await writeFile(join(login, '.claude', '.credentials.json'), 'credential-not-read');
    const files = new AttemptFilesystemService(root);
    const paths = await files.create('11111111-1111-4111-8111-111111111111');
    const codexConfig = await readFile(join(paths.codexHome, 'config.toml'), 'utf8');
    expect(codexConfig).toContain('default_permissions = "kiditem_attempt"');
    expect(codexConfig).toContain('":root" = "deny"');
    expect(codexConfig).toContain('":minimal" = "read"');
    expect(codexConfig).toContain('enabled = false');
    await files.linkProviderAuth(paths, 'codex_cli', login);
    await files.linkProviderAuth(paths, 'claude_cli', login);
    expect((await lstat(join(paths.codexHome, 'auth.json'))).isSymbolicLink()).toBe(true);
    expect(await readlink(join(paths.codexHome, 'auth.json'))).toBe(join(login, '.codex', 'auth.json'));
    expect((await lstat(join(paths.claudeConfigDir, '.credentials.json'))).isSymbolicLink()).toBe(true);
    await expect(files.remove(paths)).resolves.toBeUndefined();
  });

  it('removes only the matching owned directory and rejects invalid or symlink escape paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiditem-attempt-clean-')); roots.push(root);
    const id = '11111111-1111-4111-8111-111111111111';
    const owned = join(root, `${id}-owned`); const sibling = join(root, 'other'); const outside = await mkdtemp(join(tmpdir(), 'kiditem-attempt-outside-'));
    roots.push(outside); await mkdir(owned); await mkdir(sibling); await writeFile(join(owned, 'attempt.sock'), 'socket'); await writeFile(join(outside, 'keep'), 'keep');
    await symlink(outside, join(root, `${id}-link`));
    const files = new AttemptFilesystemService(root);
    await files.cleanAttempt(id);
    await expect(stat(owned)).rejects.toThrow();
    await expect(stat(sibling)).resolves.toBeDefined();
    await expect(stat(join(outside, 'keep'))).resolves.toBeDefined();
    await expect(files.cleanAttempt('invalid')).rejects.toThrow('attempt_filesystem_id_invalid');
  });

  it('rejects a provider-directory symlink before linking an auth artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiditem-attempt-auth-')); roots.push(root);
    const login = await mkdtemp(join(tmpdir(), 'kiditem-login-')); roots.push(login);
    const outside = await mkdtemp(join(tmpdir(), 'kiditem-login-outside-')); roots.push(outside);
    await writeFile(join(outside, 'auth.json'), 'credential-not-read');
    await symlink(outside, join(login, '.codex'));
    const files = new AttemptFilesystemService(root);
    const paths = await files.create('11111111-1111-4111-8111-111111111111');
    await expect(files.linkProviderAuth(paths, 'codex_cli', login)).rejects.toThrow('attempt_login_artifact_invalid');
  });

  it('never signals a malformed restart process marker and leaves it for manual inspection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiditem-attempt-marker-')); roots.push(root);
    const id = '11111111-1111-4111-8111-111111111111';
    const directory = join(root, `${id}-owned`); await mkdir(directory);
    await writeFile(join(directory, 'process-marker.json'), JSON.stringify({ attemptId: id, pgid: 1, startTicks: 'wrong', executable: '/not/real' }));
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const files = new AttemptFilesystemService(root);
    await expect(files.reapMarkedProcess(id)).resolves.toBe('unsafe');
    expect(kill).not.toHaveBeenCalled();
    kill.mockRestore();
  });
});
