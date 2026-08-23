import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AgentResultEnvelope } from '@kiditem/shared/agent-interaction';
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

/** One nonpersistent CLI process per Attempt. Provider output never becomes chat history. */
export class AgentAttemptExecutorService {
  private readonly finalizers = new Map<string, Promise<void>>();
  private readonly timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly paths = new Map<string, AttemptFilesystemPaths>();

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

  async start(input: { attemptId: string; runtime: 'codex_cli' | 'claude_cli'; profile: AttemptRuntimeProfile; prompt: string; mcp?: Omit<AttemptMcpBinding, 'socketPath' | 'processGroupId'>; }) {
    try {
      rejectUnsafeAttemptInput(input.prompt, input.profile);
      if (this.admission) { if (!input.mcp) throw new Error('attempt_mcp_binding_required'); await this.admission.assert(input.mcp, input.runtime); }
      const paths = await this.files.create(input.attemptId);
      this.paths.set(input.attemptId, paths);
      const command = input.runtime === 'codex_cli' ? buildCodexAttemptCommand({ workspace: paths.workspace, socketPath: paths.socketPath, mcpConfigPath: paths.mcpConfigPath, profile: input.profile }) : buildClaudeAttemptCommand({ workspace: paths.workspace, socketPath: paths.socketPath, mcpConfigPath: paths.mcpConfigPath, profile: input.profile });
      const child = this.spawnProcess(command.bin, command.args, { cwd: command.cwd, env: command.env, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
      if (!child.pid) throw new Error('attempt_process_pid_missing');
      this.processes.register(input.attemptId, child);
      await this.lifecycle?.running(input.attemptId);
      child.once('error', () => { void this.complete(input.attemptId, 'runtime_error'); });
      child.once('exit', (code) => { void this.complete(input.attemptId, code === 0 ? 'success' : 'nonzero_exit'); });
      if (!input.mcp) throw new Error('attempt_mcp_binding_required');
      await this.broker?.listen({ ...input.mcp, socketPath: paths.socketPath, processGroupId: child.pid });
      if (input.runtime === 'codex_cli') this.startCodex(input, child as ChildProcessWithoutNullStreams, paths);
      else this.startClaude(input, child as ChildProcessWithoutNullStreams);
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
      void this.complete(input.attemptId, status === 'completed' || status === 'succeeded' ? 'protocol_success' : 'runtime_error', codexTerminalSummary(params));
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
        if (terminal) void this.complete(input.attemptId, terminal.reason, terminal.summary);
      }
      if (Buffer.byteLength(buffer, 'utf8') > 64 * 1024) void this.complete(input.attemptId, 'runtime_error');
    });
    this.controls.register(input.attemptId, { send: async (message) => { child.stdin.write(claudeUserEnvelope(message)); }, interrupt: async () => { await this.complete(input.attemptId, 'interrupted'); } });
    child.stdin.write(claudeUserEnvelope(input.prompt));
  }

  private complete(attemptId: string, reason: 'success' | 'protocol_success' | 'nonzero_exit' | 'runtime_error' | 'timeout' | 'interrupted', summary?: string): Promise<void> {
    const existing = this.finalizers.get(attemptId); if (existing) return existing;
    const finalizer = (async () => {
      const paths = this.paths.get(attemptId); const timeout = this.timeouts.get(attemptId);
      if (timeout) clearTimeout(timeout); this.timeouts.delete(attemptId);
      if (reason !== 'success' && reason !== 'nonzero_exit') await this.processes.terminate(attemptId); else this.processes.remove(attemptId);
      this.controls.remove(attemptId);
      if (paths) { await this.broker?.close(paths.socketPath); await this.files.remove(paths); }
      this.paths.delete(attemptId);
      const terminal = terminalOutcome(reason, summary);
      try {
        await this.lifecycle?.terminal(attemptId, terminal.status, terminal.error, terminal.result);
      } finally {
        this.lifecycle?.release(attemptId);
      }
    })();
    this.finalizers.set(attemptId, finalizer); return finalizer;
  }
}

function terminalOutcome(reason: 'success' | 'protocol_success' | 'nonzero_exit' | 'runtime_error' | 'timeout' | 'interrupted', summary?: string): { status: TerminalStatus; error?: TerminalError; result: AgentResultEnvelope } {
  if (reason === 'success' || reason === 'protocol_success') return { status: 'succeeded', result: { outcome: 'completed', summary: boundedSummary(summary, 'Local CLI Attempt completed.'), resourceRefs: [], operationRefs: [] } };
  const error: TerminalError = reason === 'nonzero_exit' ? { code: 'attempt_exit_nonzero', message: 'Local CLI exited with a non-zero status.' } : reason === 'timeout' ? { code: 'attempt_timeout', message: 'Local CLI Attempt exceeded its time limit.' } : reason === 'interrupted' ? { code: 'attempt_interrupted', message: 'Local CLI Attempt was interrupted.' } : { code: 'attempt_runtime_error', message: 'Local CLI Attempt failed before producing a durable result.' };
  return { status: reason === 'nonzero_exit' || reason === 'runtime_error' ? 'failed' : 'process_interrupted', error, result: { outcome: 'failed', summary: error.message, resourceRefs: [], operationRefs: [], error } };
}
function claudeUserEnvelope(message: string): string { return `${JSON.stringify({ type: 'user', message: { role: 'user', content: message } })}\n`; }
function claudeTerminal(line: string): { reason: 'protocol_success' | 'runtime_error'; summary?: string } | null { try { const value = JSON.parse(line) as { type?: string; subtype?: string; is_error?: boolean; result?: unknown }; if (value.type !== 'result') return null; return { reason: value.is_error === true || value.subtype === 'error' ? 'runtime_error' : 'protocol_success', summary: typeof value.result === 'string' ? value.result : undefined }; } catch { return null; } }
function codexTerminalSummary(params: unknown): string | undefined {
  const items = (params as { turn?: { items?: unknown[] } } | null)?.turn?.items;
  if (!Array.isArray(items)) return undefined;
  for (const item of [...items].reverse()) {
    const text = (item as { type?: unknown; text?: unknown; content?: unknown }).text ?? (item as { content?: unknown }).content;
    if ((item as { type?: unknown }).type === 'agentMessage' && typeof text === 'string') return text;
  }
  return undefined;
}
function boundedSummary(value: string | undefined, fallback: string): string { const normalized = value?.trim(); return normalized ? normalized.slice(0, 8_192) : fallback; }
function rejectUnsafeAttemptInput(prompt: string, profile: AttemptRuntimeProfile): void {
  const values = [prompt, ...profile.settings ?? []].join('\n'); const forbiddenMcpContext = ['KIDITEM', 'MCP', 'EXECUTION', 'CONTEXT'].join('_');
  if (new RegExp(`--(?:resume|session|budget)|${forbiddenMcpContext}|DATABASE_URL|NEST_|HMAC|credential|provider-history`, 'i').test(values)) throw new Error('attempt_runtime_input_forbidden');
}
