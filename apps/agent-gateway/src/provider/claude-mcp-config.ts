import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** Ephemeral per-turn Claude MCP config; never a conversation descriptor. */
type ClaudeMcpFilesystem = Readonly<{
  chmod?: (path: string, mode: number) => Promise<void>;
  readdir?: (path: string, options: { withFileTypes: true }) => Promise<Dirent[]>;
  unlink?: (path: string) => Promise<void>;
}>;

export class ClaudeMcpConfigStore {
  private readonly root: string;

  constructor(private readonly options: Readonly<{ stateRoot: string; platform: 'macos' | 'windows'; filesystem?: ClaudeMcpFilesystem }>) {
    this.root = resolve(options.stateRoot, 'claude-turn-mcp');
  }

  async create(input: Readonly<{ turnId: string; mcpUrl: string; executionBinding: string }>): Promise<string> {
    if (!input.turnId || !input.executionBinding || !input.mcpUrl) throw new Error('claude_mcp_config_invalid');
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if (this.options.platform === 'macos') await this.chmod(this.root, 0o700);
    const name = createHash('sha256').update(`${input.turnId}\u0000${randomUUID()}`).digest('hex');
    const path = join(this.root, `${name}.json`);
    const config = JSON.stringify({
      mcpServers: {
        kiditem: {
          type: 'http',
          url: input.mcpUrl,
          headers: { Authorization: `Bearer ${input.executionBinding}` },
        },
      },
    });
    await writeFile(path, config, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try {
      if (this.options.platform === 'macos') await this.chmod(path, 0o600);
    } catch (error) {
      try { await this.unlink(path); }
      catch { throw new Error('claude_mcp_config_cleanup_failed'); }
      throw error;
    }
    return path;
  }

  async remove(path: string): Promise<void> {
    if (!isWithin(path, this.root)) throw new Error('claude_mcp_config_path_invalid');
    await this.unlink(path).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
  }

  /** Startup-only cleanup for secret-bearing configs left by a crash. */
  async cleanup(): Promise<void> {
    let entries: Dirent[];
    try { entries = await (this.options.filesystem?.readdir?.(this.root, { withFileTypes: true }) ?? readdir(this.root, { withFileTypes: true })); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    await Promise.all(entries
      .filter((entry) => entry.isFile() && /^[a-f0-9]{64}\.json$/.test(entry.name))
      .map((entry) => this.unlink(join(this.root, entry.name))));
  }

  private chmod(path: string, mode: number): Promise<void> { return this.options.filesystem?.chmod?.(path, mode) ?? chmod(path, mode); }
  private unlink(path: string): Promise<void> { return this.options.filesystem?.unlink?.(path) ?? unlink(path); }
}

function isWithin(value: string, root: string): boolean {
  const relation = relative(root, resolve(value));
  return relation !== '' && !relation.startsWith('..') && !relation.includes('/..') && !relation.includes('\\..');
}
