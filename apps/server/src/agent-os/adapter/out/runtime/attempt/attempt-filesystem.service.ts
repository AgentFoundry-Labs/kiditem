import { lstat, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export interface AttemptFilesystemPaths {
  root: string;
  workspace: string;
  broker: string;
  socketPath: string;
  mcpConfigPath: string;
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
    const socketPath = join(broker, 'attempt.sock');
    const mcpConfigPath = join(broker, 'mcp.json');
    await writeFile(mcpConfigPath, JSON.stringify({
      mcpServers: {
        kiditem_attempt: {
          command: process.execPath,
          args: [resolve(process.cwd(), 'dist/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.js')],
          env: { ATTEMPT_MCP_SOCKET_PATH: socketPath },
        },
      },
    }), { mode: 0o600 });
    return { root, workspace, broker, socketPath, mcpConfigPath };
  }

  async remove(paths: AttemptFilesystemPaths): Promise<void> {
    const target = resolve(paths.root);
    const root = resolve(this.root);
    const targetRelative = relative(root, target);
    if (!targetRelative || targetRelative.startsWith('..') || targetRelative.includes('/..') || targetRelative.includes('\\..')) throw new Error('attempt_filesystem_scope_invalid');
    for (const boundary of [root, ...targetRelative.split(/[\\/]+/).reduce<string[]>((paths, segment) => {
      paths.push(join(paths.at(-1) ?? root, segment));
      return paths;
    }, [])]) {
      const boundaryInfo = await lstat(boundary).catch(() => null);
      if (boundaryInfo?.isSymbolicLink()) throw new Error('attempt_filesystem_symlink_rejected');
    }
    const info = await lstat(target).catch(() => null);
    if (!info) return;
    if (info.isSymbolicLink()) throw new Error('attempt_filesystem_symlink_rejected');
    await rm(target, { recursive: true, force: true, maxRetries: 2 });
  }

  /** Removes only UUID-prefixed non-symlink attempt directories below this root. */
  async cleanAttempt(attemptId: string): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)) {
      throw new Error('attempt_filesystem_id_invalid');
    }
    const root = resolve(this.root);
    const rootInfo = await lstat(root).catch(() => null);
    if (!rootInfo) return;
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error('attempt_filesystem_scope_invalid');
    const prefix = `${attemptId}-`;
    const entries = await readdir(root, { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => entry.name.startsWith(prefix) && entry.isDirectory())
      .map((entry) => this.remove({
        root: join(root, entry.name), workspace: '', broker: '', socketPath: '', mcpConfigPath: '',
      })));
  }
}
