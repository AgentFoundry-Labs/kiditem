import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, symlink, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AttemptFilesystemService } from './attempt-filesystem.service';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('AttemptFilesystemService.cleanAttempt', () => {
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
});
