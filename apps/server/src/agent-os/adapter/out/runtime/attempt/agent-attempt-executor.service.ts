import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { AgentResultEnvelopeSchema, type AgentResultEnvelope } from '@kiditem/shared/agent-interaction';
import type { AttemptMcpBinding, AttemptMcpBrokerService } from '../../../in/mcp/attempt-mcp-broker.service';
import { AttemptFilesystemService, type AttemptFilesystemPaths } from './attempt-filesystem.service';
import { AgentAttemptProcessRegistry } from './agent-attempt-process-registry';
import { AttemptLiveControlRegistry } from './attempt-live-control.registry';
import { buildClaudeAttemptCommand } from './claude-attempt.adapter';
import { buildCodexAttemptCommand, type AttemptRuntimeProfile } from './codex-attempt.adapter';
import { CodexAppServerSession } from './codex-app-server-session';
import type { AgentAttemptRuntimeAdmissionService } from './agent-attempt-runtime-admission.service';

type TerminalStatus = 'succeeded' | 'failed' | 'process_interrupted' | 'cancelled';
type TerminalError = { code: string; message: string };
type Lifecycle = { running(attemptId: string): Promise<void>; terminal(attemptId: string, status: TerminalStatus, error?: TerminalError, result?: AgentResultEnvelope): Promise<void>; release(attemptId: string): void };
type ExitTerminalReason = 'success' | 'nonzero_exit';
type TerminalReason = ExitTerminalReason | 'protocol_success' | 'runtime_error' | 'timeout' | 'interrupted';
type ExitDrain = {
  exitReason: ExitTerminalReason | null;
  stdoutClosed: boolean;
  deferred?: { reason: TerminalReason; providerResult?: AgentResultEnvelope | null };
};

/** One nonpersistent CLI process per Attempt. Provider output never becomes chat history. */
export class AgentAttemptExecutorService {
  private readonly finalizers = new Map<string, Promise<void>>();
  /** Prevent late exit/error callbacks from terminalizing one immutable Attempt twice. */
  private readonly terminalized = new Set<string>();
  private readonly timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly paths = new Map<string, AttemptFilesystemPaths>();
  /** Exit precedes the final stdout chunk on some Node/CLI interleavings. */
  private readonly exitDrains = new Map<string, ExitDrain>();

  constructor(
    private readonly files: AttemptFilesystemService,
    private readonly processes: AgentAttemptProcessRegistry,
    private readonly controls: AttemptLiveControlRegistry,
    private readonly broker?: Pick<AttemptMcpBrokerService, 'listen' | 'close'>,
    private readonly spawnProcess: typeof spawn = spawn,
    private readonly maxElapsedMs = 30 * 60 * 1_000,
    private readonly admission?: Pick<AgentAttemptRuntimeAdmissionService, 'assert'>,
    private readonly lifecycle?: Lifecycle,
  ) {}

  async start(input: { attemptId: string; runtime: 'codex_cli' | 'claude_cli'; profile: AttemptRuntimeProfile; prompt: string; instructionProfileRef?: string; mcp?: Omit<AttemptMcpBinding, 'socketPath' | 'processGroupId'>; }) {
    try {
      this.terminalized.delete(input.attemptId);
      if (this.admission) { if (!input.mcp) throw new Error('attempt_mcp_binding_required'); await this.admission.assert(input.mcp, input.runtime); }
      const paths = await this.files.create(input.attemptId);
      this.paths.set(input.attemptId, paths);
      await this.files.linkProviderAuth(paths, input.runtime, input.profile.loginHome);
      const isolatedProfile: AttemptRuntimeProfile = {
        ...input.profile,
        home: paths.home ?? join(paths.root, 'home'),
        codexHome: paths.codexHome ?? join(paths.root, 'codex-home'),
        claudeConfigDir: paths.claudeConfigDir ?? join(paths.root, 'claude-config'),
      };
      const prompt = input.instructionProfileRef ? await promptWithInstructionProfile(input.instructionProfileRef, input.prompt) : input.prompt;
      const command = input.runtime === 'codex_cli' ? buildCodexAttemptCommand({ workspace: paths.workspace, socketPath: paths.socketPath, mcpConfigPath: paths.mcpConfigPath, profile: isolatedProfile }) : buildClaudeAttemptCommand({ workspace: paths.workspace, socketPath: paths.socketPath, mcpConfigPath: paths.mcpConfigPath, profile: isolatedProfile });
      const child = this.spawnProcess(command.bin, command.args, { cwd: command.cwd, env: command.env, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
      if (!child.pid) throw new Error('attempt_process_pid_missing');
      this.processes.register(input.attemptId, child);
      // Always drain provider diagnostics so a noisy CLI cannot fill stderr
      // and deadlock the owned Attempt. Diagnostics are intentionally neither
      // stored nor returned to the model.
      child.stderr.on('data', () => undefined);
      if (typeof child.stderr.resume === 'function') child.stderr.resume();
      // Install terminal listeners before any awaited lifecycle/broker work: a
      // fast child must not become an orphaned starting Attempt.
      const exitDrain: ExitDrain = { exitReason: null, stdoutClosed: false };
      this.exitDrains.set(input.attemptId, exitDrain);
      child.stdout.once('close', () => {
        exitDrain.stdoutClosed = true;
        const deferred = exitDrain.deferred ?? (exitDrain.exitReason ? { reason: exitDrain.exitReason } : undefined);
        if (deferred) void this.complete(input.attemptId, deferred.reason, deferred.providerResult);
      });
      child.once('error', () => { void this.complete(input.attemptId, 'runtime_error'); });
      child.once('exit', (code) => {
        exitDrain.exitReason = code === 0 ? 'success' : 'nonzero_exit';
        if (exitDrain.stdoutClosed) void this.complete(input.attemptId, exitDrain.exitReason);
      });
      // The marker is written after terminal listeners are installed: a child
      // that exits while `/proc` identity is captured still has exactly one
      // durable finalizer. A marker failure enters the catch/finalizer path.
      await this.files.markProcess?.(paths, input.attemptId, child.pid);
      if (this.terminalized.has(input.attemptId)) return { child, paths };
      await this.lifecycle?.running(input.attemptId);
      if (this.terminalized.has(input.attemptId)) return { child, paths };
      if (!input.mcp) throw new Error('attempt_mcp_binding_required');
      await this.broker?.listen({ ...input.mcp, socketPath: paths.socketPath, processGroupId: child.pid });
      if (this.terminalized.has(input.attemptId)) return { child, paths };
      if (input.runtime === 'codex_cli') this.startCodex({ ...input, profile: isolatedProfile, prompt }, child as ChildProcessWithoutNullStreams, paths);
      else this.startClaude({ ...input, prompt }, child as ChildProcessWithoutNullStreams);
      this.timeouts.set(input.attemptId, setTimeout(() => { void this.complete(input.attemptId, 'timeout'); }, this.maxElapsedMs));
      return { child, paths };
    } catch (error) { await this.complete(input.attemptId, 'runtime_error'); throw error; }
  }

  async interrupt(attemptId: string): Promise<void> {
    const handle = this.controls.get(attemptId);
    if (!handle) throw new Error('attempt_not_live');
    await handle.interrupt();
  }

  async cleanup(attemptId: string, paths: AttemptFilesystemPaths): Promise<void> { this.paths.set(attemptId, paths); await this.complete(attemptId, 'interrupted'); }

  private startCodex(input: { attemptId: string; profile: AttemptRuntimeProfile; prompt: string }, child: ChildProcessWithoutNullStreams, paths: AttemptFilesystemPaths): void {
    const session = new CodexAppServerSession((line) => child.stdin.write(line), 64 * 1024, (method, params) => {
      if (method !== 'turn/completed') return;
      const status = ((params as { turn?: { status?: unknown } } | null)?.turn?.status);
      const result = codexTerminalResult(params);
      void this.complete(
        input.attemptId,
        status === 'completed' || status === 'succeeded' ? 'protocol_success' : 'runtime_error',
        result,
      );
    });
    child.stdout.on('data', (chunk) => { try { session.receive(String(chunk)); } catch { void this.complete(input.attemptId, 'runtime_error'); } });
    this.controls.register(input.attemptId, { send: (message) => session.steer(message), interrupt: async () => { await session.interrupt(); await this.complete(input.attemptId, 'interrupted'); } });
    void session.start({ model: input.profile.model, cwd: paths.workspace, prompt: input.prompt }).catch(() => this.complete(input.attemptId, 'runtime_error'));
  }

  private startClaude(input: { attemptId: string; prompt: string }, child: ChildProcessWithoutNullStreams): void {
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n'); const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        const terminal = claudeTerminal(line);
        if (terminal) void this.complete(input.attemptId, terminal.reason, terminal.result);
      }
      if (Buffer.byteLength(buffer, 'utf8') > 64 * 1024) void this.complete(input.attemptId, 'runtime_error');
    });
    this.controls.register(input.attemptId, { send: async (message) => { child.stdin.write(claudeUserEnvelope(message)); }, interrupt: async () => { await this.complete(input.attemptId, 'interrupted'); } });
    child.stdin.write(claudeUserEnvelope(input.prompt));
  }

  private complete(attemptId: string, reason: TerminalReason, providerResult?: AgentResultEnvelope | null): Promise<void> {
    const existing = this.finalizers.get(attemptId); if (existing) return existing;
    if (this.terminalized.has(attemptId)) return Promise.resolve();
    const exitDrain = this.exitDrains.get(attemptId);
    if (exitDrain?.exitReason && !exitDrain.stdoutClosed && waitsForExitedStdout(reason)) {
      exitDrain.deferred = preferredExitTerminal(
        exitDrain.deferred ?? { reason: exitDrain.exitReason },
        { reason, providerResult },
      );
      return Promise.resolve();
    }
    this.terminalized.add(attemptId);
    if (this.terminalized.size > 1_024) this.terminalized.delete(this.terminalized.values().next().value as string);
    const finalizer = (async () => {
      const paths = this.paths.get(attemptId); const timeout = this.timeouts.get(attemptId);
      if (timeout) clearTimeout(timeout); this.timeouts.delete(attemptId);
      // A provider-declared terminal result owns an app-server process group.
      // Tear down that exact group rather than leaving provider state alive.
      // Exit/error callbacks have already observed their process end.
      if (reason === 'success' || reason === 'nonzero_exit') this.processes.remove(attemptId);
      else await this.processes.terminate(attemptId);
      this.controls.remove(attemptId);
      if (paths) { await this.broker?.close(paths.socketPath); await this.files.remove(paths); }
      this.paths.delete(attemptId);
      this.exitDrains.delete(attemptId);
      const terminal = terminalOutcome(reason, providerResult);
      try {
        await this.lifecycle?.terminal(attemptId, terminal.status, terminal.error, terminal.result);
      } finally {
        this.lifecycle?.release(attemptId);
      }
    })();
    this.finalizers.set(attemptId, finalizer);
    void finalizer.finally(() => this.finalizers.delete(attemptId)).catch(() => undefined);
    return finalizer;
  }
}

async function promptWithInstructionProfile(reference: string, prompt: string): Promise<string> {
  const filename = await resolveInstructionProfilePath(reference);
  const profile = await readFile(filename, 'utf8');
  if (!profile.trim() || Buffer.byteLength(profile, 'utf8') > 12_000) throw new Error('attempt_instruction_profile_invalid');
  return `${profile.trim()}\n\n# Current durable work\n${prompt}`.slice(0, 24_000);
}

/** Resolves image `/app/apps/server` and local-repository roots without CWD trust. */
export async function resolveInstructionProfilePath(reference: string, cwd = process.cwd()): Promise<string> {
  if (!/^agent-config\/prompts\/agents\/[a-z_]+\.md$/.test(reference)) throw new Error('attempt_instruction_profile_invalid');
  for (const root of [resolve(cwd), resolve(cwd, '../..')]) {
    const filename = resolve(root, reference);
    if (relative(root, filename).startsWith('..')) continue;
    const info = await lstat(filename).catch(() => null);
    if (!info) continue;
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('attempt_instruction_profile_invalid');
    const realRoot = await realpath(root).catch(() => null);
    const realFile = await realpath(filename).catch(() => null);
    if (!realRoot || !realFile || relative(realRoot, realFile).startsWith('..')) throw new Error('attempt_instruction_profile_invalid');
    return realFile;
  }
  throw new Error('attempt_instruction_profile_missing');
}

function terminalOutcome(reason: 'success' | 'protocol_success' | 'nonzero_exit' | 'runtime_error' | 'timeout' | 'interrupted', providerResult?: AgentResultEnvelope | null): { status: TerminalStatus; error?: TerminalError; result?: AgentResultEnvelope } {
  if (reason === 'protocol_success' && providerResult) {
    const parsed = AgentResultEnvelopeSchema.safeParse(providerResult);
    if (parsed.success) return { status: parsed.data.outcome === 'failed' ? 'failed' : 'succeeded', result: parsed.data, error: parsed.data.error };
  }
  if (reason === 'success' || reason === 'protocol_success') {
    const error = { code: 'attempt_result_invalid', message: 'Local CLI completed without a valid durable result.' };
    return { status: 'failed', error };
  }
  const error: TerminalError = reason === 'nonzero_exit' ? { code: 'attempt_exit_nonzero', message: 'Local CLI exited with a non-zero status.' } : reason === 'timeout' ? { code: 'attempt_timeout', message: 'Local CLI Attempt exceeded its time limit.' } : reason === 'interrupted' ? { code: 'attempt_interrupted', message: 'Local CLI Attempt was interrupted.' } : { code: 'attempt_runtime_error', message: 'Local CLI Attempt failed before producing a durable result.' };
  return { status: reason === 'nonzero_exit' || reason === 'runtime_error' ? 'failed' : 'process_interrupted', error };
}

function waitsForExitedStdout(reason: TerminalReason): boolean {
  return reason === 'success' || reason === 'nonzero_exit' || reason === 'protocol_success' || reason === 'runtime_error';
}

function preferredExitTerminal(
  current: { reason: TerminalReason; providerResult?: AgentResultEnvelope | null },
  candidate: { reason: TerminalReason; providerResult?: AgentResultEnvelope | null },
): { reason: TerminalReason; providerResult?: AgentResultEnvelope | null } {
  // A non-zero process exit stays authoritative. A successful exit may still
  // be upgraded to the provider's durable terminal envelope while stdout
  // drains.
  if (current.reason === 'nonzero_exit') return current;
  if (candidate.reason === 'protocol_success' || candidate.reason === 'runtime_error') return candidate;
  return current;
}

function claudeUserEnvelope(message: string): string { return `${JSON.stringify({ type: 'user', message: { role: 'user', content: message } })}\n`; }
function claudeTerminal(line: string): { reason: 'protocol_success' | 'runtime_error'; result?: AgentResultEnvelope | null } | null {
  try {
    const value = JSON.parse(line) as { type?: string; subtype?: string; is_error?: boolean; structured_output?: unknown };
    if (value.type !== 'result') return null;
    return {
      reason: value.is_error === true || value.subtype === 'error' ? 'runtime_error' : 'protocol_success',
      result: parseProviderResult(value.structured_output),
    };
  } catch { return null; }
}
function codexTerminalResult(params: unknown): AgentResultEnvelope | null {
  const items = (params as { turn?: { items?: unknown[] } } | null)?.turn?.items;
  if (!Array.isArray(items)) return null;
  for (const item of [...items].reverse()) {
    const text = (item as { type?: unknown; text?: unknown; content?: unknown }).text ?? (item as { content?: unknown }).content;
    if ((item as { type?: unknown }).type === 'agentMessage') return parseProviderResult(text);
  }
  return null;
}
function parseProviderResult(value: unknown): AgentResultEnvelope | null {
  const json = typeof value === 'string' ? parseJson(value) : value;
  const parsed = AgentResultEnvelopeSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
function parseJson(value: string): unknown { try { return JSON.parse(value); } catch { return undefined; } }
