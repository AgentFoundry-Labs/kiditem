import { lstat, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export interface AttemptFilesystemPaths {
  root: string;
  workspace: string;
  broker: string;
  socketPath: string;
}

/** Creates a blank work area; provider login homes are intentionally not copied. */
export class AttemptFilesystemService {
  constructor(private readonly root = resolve(tmpdir(), 'kiditem-agent-attempts')) {}

  async create(attemptId: string): Promise<AttemptFilesystemPaths> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const root = await mkdtemp(join(this.root, `${attemptId}-`));
    const workspace = join(root, 'workspace');
    const broker = join(root, 'broker');
    await Promise.all([
      mkdir(workspace, { mode: 0o700 }),
      mkdir(broker, { mode: 0o700 }),
    ]);
    return { root, workspace, broker, socketPath: join(broker, 'attempt.sock') };
  }

  async remove(paths: AttemptFilesystemPaths): Promise<void> {
    const target = resolve(paths.root);
    const relative = target.slice(this.root.length + 1);
    if (!relative || relative.includes('..')) throw new Error('attempt_filesystem_scope_invalid');
    const info = await lstat(target).catch(() => null);
    if (!info) return;
    if (info.isSymbolicLink()) throw new Error('attempt_filesystem_symlink_rejected');
    await rm(target, { recursive: true, force: true, maxRetries: 2 });
  }
}
