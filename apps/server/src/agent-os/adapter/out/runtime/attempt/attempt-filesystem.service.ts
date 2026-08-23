import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export interface AttemptFilesystemPaths {
  root: string;
  workspace: string;
  broker: string;
  socketPath: string;
  mcpConfigPath: string;
  home: string;
  codexHome: string;
  claudeConfigDir: string;
}

/** Creates a blank work area; provider login homes are intentionally not copied. */
export class AttemptFilesystemService {
  constructor(private readonly root = resolve(tmpdir(), 'kiditem-agent-attempts')) {}

  async create(attemptId: string): Promise<AttemptFilesystemPaths> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const root = await mkdtemp(join(this.root, `${attemptId}-`));
    const workspace = join(root, 'workspace');
    const broker = join(root, 'broker');
    const home = join(root, 'home');
    const codexHome = join(root, 'codex-home');
    const claudeConfigDir = join(root, 'claude-config');
    await Promise.all([
      mkdir(workspace, { mode: 0o700 }),
      mkdir(broker, { mode: 0o700 }),
      mkdir(home, { mode: 0o700 }),
      mkdir(codexHome, { mode: 0o700 }),
      mkdir(claudeConfigDir, { mode: 0o700 }),
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
    return { root, workspace, broker, socketPath, mcpConfigPath, home, codexHome, claudeConfigDir };
  }

  /**
   * Links one verified service-account auth artifact into an otherwise empty
   * per-Attempt provider home. Credential bytes are never read or copied.
   */
  async linkProviderAuth(paths: AttemptFilesystemPaths, runtime: 'codex_cli' | 'claude_cli', loginHome: string): Promise<void> {
    const sourceHome = resolve(loginHome);
    const home = await lstat(sourceHome).catch(() => null);
    if (!home?.isDirectory() || home.isSymbolicLink()) throw new Error('attempt_login_home_invalid');
    const providerDirectory = runtime === 'codex_cli' ? join(sourceHome, '.codex') : join(sourceHome, '.claude');
    const providerInfo = await lstat(providerDirectory).catch(() => null);
    if (!providerInfo?.isDirectory() || providerInfo.isSymbolicLink()) throw new Error('attempt_login_artifact_invalid');
    const source = runtime === 'codex_cli' ? join(providerDirectory, 'auth.json') : join(providerDirectory, '.credentials.json');
    const info = await lstat(source).catch(() => null);
    if (!info?.isFile() || info.isSymbolicLink()) throw new Error('attempt_login_artifact_missing');
    const [realHome, realArtifact] = await Promise.all([realpath(sourceHome), realpath(source)]);
    if (!isContained(realHome, realArtifact)) throw new Error('attempt_login_artifact_outside_home');
    const target = runtime === 'codex_cli' ? join(paths.codexHome, 'auth.json') : join(paths.claudeConfigDir, '.credentials.json');
    await symlink(source, target);
  }

  /**
   * Records only restart-safe process identity metadata.  It intentionally
   * excludes arguments, environment, credentials, and provider state.
   */
  async markProcess(paths: AttemptFilesystemPaths, attemptId: string, pgid: number): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId) || !Number.isSafeInteger(pgid) || pgid <= 0) throw new Error('attempt_process_marker_invalid');
    const identity = await linuxProcessIdentity(pgid);
    if (!identity || identity.pgrp !== pgid) throw new Error('attempt_process_marker_identity_unavailable');
    await writeFile(join(paths.root, 'process-marker.json'), JSON.stringify({ attemptId, pgid, ...identity }), { mode: 0o600 });
  }

  /** Reaps only a detached group whose exact `/proc` identity still matches. */
  async reapMarkedProcess(attemptId: string): Promise<'absent' | 'reaped' | 'unsafe'> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)) return 'unsafe';
    const root = resolve(this.root);
    const rootInfo = await lstat(root).catch(() => null);
    if (!rootInfo) return 'absent';
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return 'unsafe';
    const entries = await readdir(root, { withFileTypes: true });
    const candidate = entries.find((entry) => entry.isDirectory() && entry.name.startsWith(`${attemptId}-`));
    if (!candidate) return 'absent';
    const directory = join(root, candidate.name); const marker = join(directory, 'process-marker.json');
    const [directoryInfo, markerInfo] = await Promise.all([lstat(directory).catch(() => null), lstat(marker).catch(() => null)]);
    if (!directoryInfo?.isDirectory() || directoryInfo.isSymbolicLink() || !markerInfo?.isFile() || markerInfo.isSymbolicLink() || markerInfo.size > 1024) return 'unsafe';
    let parsed: { attemptId?: unknown; pgid?: unknown; startTicks?: unknown; executable?: unknown; pgrp?: unknown };
    try { parsed = JSON.parse(await readFile(marker, 'utf8')) as typeof parsed; } catch { return 'unsafe'; }
    if (parsed.attemptId !== attemptId || !Number.isSafeInteger(parsed.pgid) || (parsed.pgid as number) <= 0 || parsed.pgrp !== parsed.pgid || typeof parsed.startTicks !== 'string' || typeof parsed.executable !== 'string') return 'unsafe';
    const current = await linuxProcessIdentity(parsed.pgid as number);
    if (!current || current.pgrp !== parsed.pgid || current.startTicks !== parsed.startTicks || current.executable !== parsed.executable) return 'unsafe';
    try { process.kill(-(parsed.pgid as number), 'SIGTERM'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return 'unsafe'; }
    if (await processStillMatches(parsed.pgid as number, current, 1_000)) {
      try { process.kill(-(parsed.pgid as number), 'SIGKILL'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return 'unsafe'; }
      if (await processStillMatches(parsed.pgid as number, current, 1_000)) return 'unsafe';
    }
    return 'reaped';
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
        root: join(root, entry.name), workspace: '', broker: '', socketPath: '', mcpConfigPath: '', home: '', codexHome: '', claudeConfigDir: '',
      })));
  }
}

async function linuxProcessIdentity(pid: number): Promise<{ startTicks: string; executable: string; pgrp: number } | null> {
  try {
    const [stat, executable] = await Promise.all([readFile(`/proc/${pid}/stat`, 'utf8'), realpath(`/proc/${pid}/exe`)]);
    const closing = stat.lastIndexOf(')');
    const fields = stat.slice(closing + 2).trim().split(/\s+/);
    const startTicks = fields[19]; // field 22, after pid/comm
    const pgrp = Number(fields[2]); // field 5, after pid/comm
    if (!startTicks || !/^[0-9]+$/.test(startTicks) || !Number.isSafeInteger(pgrp) || pgrp <= 0) return null;
    return { startTicks, executable, pgrp };
  } catch { return null; }
}

async function processStillMatches(pid: number, expected: { startTicks: string; executable: string; pgrp: number }, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  do {
    const current = await linuxProcessIdentity(pid);
    if (!current || current.startTicks !== expected.startTicks || current.executable !== expected.executable || current.pgrp !== expected.pgrp) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < until);
  return true;
}

function isContained(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return Boolean(relativePath) && !relativePath.startsWith('..') && !relativePath.includes('/..') && !relativePath.includes('\\..');
}
