import { afterEach, describe, expect, it } from 'vitest';
import { lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProviderAuthReferenceService } from './provider-auth-reference';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('ProviderAuthReferenceService', () => {
  it('validates exactly one persistent auth artifact without reading its bytes and symlinks it on macOS', async () => {
    const loginRoot = await tmp('kiditem-login-'); const targetRoot = await tmp('kiditem-target-');
    await mkdir(join(loginRoot, '.claude')); await writeFile(join(loginRoot, '.claude', '.credentials.json'), 'private-login-artifact');
    const auth = new ProviderAuthReferenceService({ loginRoot, platform: 'macos' });
    const reference = await auth.resolve('claude_cli');
    const target = join(targetRoot, '.credentials.json');
    await auth.materialize(reference, target);

    expect((await lstat(target)).isSymbolicLink()).toBe(true);
    expect(await readFile(join(loginRoot, '.claude', '.credentials.json'), 'utf8')).toBe('private-login-artifact');
  });

  it('rejects missing or symlinked provider credential shapes rather than copying the provider home', async () => {
    const loginRoot = await tmp('kiditem-login-'); const outside = await tmp('kiditem-outside-');
    await mkdir(join(loginRoot, '.codex')); await writeFile(join(outside, 'auth.json'), 'x');
    await (await import('node:fs/promises')).symlink(join(outside, 'auth.json'), join(loginRoot, '.codex', 'auth.json'));
    await expect(new ProviderAuthReferenceService({ loginRoot, platform: 'macos' }).resolve('codex_cli')).rejects.toThrow('provider_auth_reference_invalid');
  });

  it('uses a same-volume hard link on Windows rather than a copied credential artifact', async () => {
    const loginRoot = await tmp('kiditem-login-'); const targetRoot = await tmp('kiditem-target-');
    await mkdir(join(loginRoot, '.codex')); const source = join(loginRoot, '.codex', 'auth.json'); await writeFile(source, 'private-login-artifact');
    const auth = new ProviderAuthReferenceService({ loginRoot, platform: 'windows' });
    const target = join(targetRoot, 'auth.json'); await auth.materialize(await auth.resolve('codex_cli'), target);
    expect((await lstat(target)).isSymbolicLink()).toBe(false);
    expect((await stat(target)).ino).toBe((await stat(source)).ino);
  });
});
async function tmp(prefix: string): Promise<string> { const value = await mkdtemp(join(tmpdir(), prefix)); roots.push(value); return value; }
