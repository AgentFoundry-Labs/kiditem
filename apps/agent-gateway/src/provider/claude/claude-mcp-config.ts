import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { MCP_CONVERSATION_ID_HEADER } from '@kiditem/shared/agent-runtime';

const TEMPORARY_ROOT_PREFIX = 'kiditem-agent-gateway-claude-mcp-';
const CONFIG_FILE_PATTERN = /^[a-f0-9]{64}\.json$/;
const TEMPORARY_ROOT_PATTERN = /^kiditem-agent-gateway-claude-mcp-([1-9][0-9]*)-[A-Za-z0-9_-]+$/;

/** Ephemeral per-turn Claude MCP config; never a conversation descriptor. */
type ClaudeMcpFilesystem = Readonly<{
  chmod?: (path: string, mode: number) => Promise<void>;
  readdir?: (path: string, options: { withFileTypes: true }) => Promise<Dirent[]>;
  rm?: (path: string, options: { recursive: true; force: true }) => Promise<void>;
  unlink?: (path: string) => Promise<void>;
}>;

type ClaudeMcpConfigOptions = Readonly<{
  /** Retained only to remove legacy secret files from prior Gateway versions. */
  stateRoot: string;
  /** The configured Gateway platform remains an explicit launch contract. */
  platform: 'macos' | 'windows';
  /** Testable base for an OS-temporary, process-owned config directory. */
  temporaryRoot?: string;
  /** Test seams only; production uses the live Gateway process identity. */
  processId?: number;
  isProcessAlive?: (processId: number) => boolean;
  filesystem?: ClaudeMcpFilesystem;
}>;

export class ClaudeMcpConfigStore {
  private readonly legacyRoot: string;
  private readonly temporaryBase: string;
  private readonly processId: number;
  private temporaryConfigRoot: string | undefined;
  private temporaryConfigRootPromise: Promise<string> | undefined;

  constructor(private readonly options: ClaudeMcpConfigOptions) {
    this.legacyRoot = resolve(options.stateRoot, 'claude-turn-mcp');
    this.temporaryBase = resolve(options.temporaryRoot ?? tmpdir());
    this.processId = options.processId ?? process.pid;
    if (!Number.isSafeInteger(this.processId) || this.processId < 1) throw new Error('claude_mcp_config_invalid');
  }

  async create(input: Readonly<{ turnId: string; conversationId: string; mcpUrl: string; mcpTransportToken: string }>): Promise<string> {
    if (!input.turnId || !input.conversationId || !input.mcpTransportToken || !input.mcpUrl) throw new Error('claude_mcp_config_invalid');
    const root = await this.ensureTemporaryRoot();
    const name = createHash('sha256').update(`${input.turnId}\u0000${randomUUID()}`).digest('hex');
    const path = join(root, `${name}.json`);
    if (!isWithin(path, root)) throw new Error('claude_mcp_config_path_invalid');
    const config = JSON.stringify({
      mcpServers: {
        kiditem: {
          type: 'http',
          url: input.mcpUrl,
          headers: {
            Authorization: `Bearer ${input.mcpTransportToken}`,
            [MCP_CONVERSATION_ID_HEADER]: input.conversationId,
          },
        },
      },
    });
    try {
      await writeFile(path, config, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      // chmod is a portable best-effort restriction. Windows maps its mode
      // semantics differently, but invoking it keeps the boundary deterministic.
      await this.chmod(path, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        try { await this.unlink(path); }
        catch (cleanupError) {
          if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('claude_mcp_config_cleanup_failed');
        }
      }
      throw error;
    }
    return path;
  }

  async remove(path: string): Promise<void> {
    const root = this.temporaryConfigRoot;
    if (!root || !isWithin(path, root)) throw new Error('claude_mcp_config_path_invalid');
    await this.unlink(path).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
  }

  /** Startup-only cleanup removes legacy durable files and dead-process temp roots. */
  async cleanup(): Promise<void> {
    await this.cleanupLegacyFiles();
    await this.cleanupDeadTemporaryRoots();
  }

  /** Gateway shutdown removes the process-owned temporary boundary. */
  async close(): Promise<void> {
    const root = this.temporaryConfigRoot ?? await this.temporaryConfigRootPromise;
    if (!root) return;
    if (!isWithin(root, this.temporaryBase)) throw new Error('claude_mcp_config_path_invalid');
    await this.removeDirectory(root);
    if (this.temporaryConfigRoot === root) this.temporaryConfigRoot = undefined;
  }

  private ensureTemporaryRoot(): Promise<string> {
    if (this.temporaryConfigRoot) return Promise.resolve(this.temporaryConfigRoot);
    if (this.temporaryConfigRootPromise) return this.temporaryConfigRootPromise;
    const pending = this.createTemporaryRoot();
    this.temporaryConfigRootPromise = pending;
    void pending.then(
      (root) => {
        if (this.temporaryConfigRootPromise === pending) {
          this.temporaryConfigRoot = root;
          this.temporaryConfigRootPromise = undefined;
        }
      },
      () => { if (this.temporaryConfigRootPromise === pending) this.temporaryConfigRootPromise = undefined; },
    );
    return pending;
  }

  private async createTemporaryRoot(): Promise<string> {
    await mkdir(this.temporaryBase, { recursive: true, mode: 0o700 });
    const root = await mkdtemp(join(this.temporaryBase, `${TEMPORARY_ROOT_PREFIX}${this.processId}-`));
    if (!isWithin(root, this.temporaryBase)) throw new Error('claude_mcp_config_path_invalid');
    try {
      await this.chmod(root, 0o700);
    } catch (error) {
      try { await this.removeDirectory(root); }
      catch { throw new Error('claude_mcp_config_cleanup_failed'); }
      throw error;
    }
    return root;
  }

  private async cleanupLegacyFiles(): Promise<void> {
    const entries = await this.readDirectoryOrMissing(this.legacyRoot);
    if (!entries) return;
    await Promise.all(entries
      .filter((entry) => entry.isFile() && CONFIG_FILE_PATTERN.test(entry.name))
      .map((entry) => {
        const path = join(this.legacyRoot, entry.name);
        if (!isWithin(path, this.legacyRoot)) throw new Error('claude_mcp_config_path_invalid');
        return this.unlink(path);
      }));
  }

  private async cleanupDeadTemporaryRoots(): Promise<void> {
    const entries = await this.readDirectoryOrMissing(this.temporaryBase);
    if (!entries) return;
    for (const entry of entries) {
      const ownerProcessId = temporaryRootProcessId(entry);
      if (!entry.isDirectory() || ownerProcessId === undefined || ownerProcessId === this.processId || this.isProcessAlive(ownerProcessId)) continue;
      const root = join(this.temporaryBase, entry.name);
      if (!isWithin(root, this.temporaryBase)) throw new Error('claude_mcp_config_path_invalid');
      await this.removeDirectory(root);
    }
  }

  private async readDirectoryOrMissing(path: string): Promise<Dirent[] | undefined> {
    try { return await (this.options.filesystem?.readdir?.(path, { withFileTypes: true }) ?? readdir(path, { withFileTypes: true })); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  private isProcessAlive(processId: number): boolean {
    if (this.options.isProcessAlive) return this.options.isProcessAlive(processId);
    try {
      process.kill(processId, 0);
      return true;
    } catch (error) {
      // An unknown inspection error is treated as live so cleanup cannot
      // delete another Gateway's config directory.
      return (error as NodeJS.ErrnoException).code !== 'ESRCH';
    }
  }

  private chmod(path: string, mode: number): Promise<void> { return this.options.filesystem?.chmod?.(path, mode) ?? chmod(path, mode); }
  private removeDirectory(path: string): Promise<void> { return this.options.filesystem?.rm?.(path, { recursive: true, force: true }) ?? rm(path, { recursive: true, force: true }); }
  private unlink(path: string): Promise<void> { return this.options.filesystem?.unlink?.(path) ?? unlink(path); }
}

function temporaryRootProcessId(entry: Dirent): number | undefined {
  const match = TEMPORARY_ROOT_PATTERN.exec(entry.name);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : undefined;
}

function isWithin(value: string, root: string): boolean {
  const relation = relative(root, resolve(value));
  return relation !== '' && !relation.startsWith('..') && !relation.includes('/..') && !relation.includes('\\..');
}
