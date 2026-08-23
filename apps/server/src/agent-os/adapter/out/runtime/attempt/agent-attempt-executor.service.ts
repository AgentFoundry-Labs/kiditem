import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AttemptMcpBinding, AttemptMcpBrokerService } from '../../../in/mcp/attempt-mcp-broker.service';
import { AttemptFilesystemService, type AttemptFilesystemPaths } from './attempt-filesystem.service';
import { AgentAttemptProcessRegistry } from './agent-attempt-process-registry';
import { AttemptLiveControlRegistry } from './attempt-live-control.registry';
import { buildClaudeAttemptCommand } from './claude-attempt.adapter';
import { buildCodexAttemptCommand, type AttemptRuntimeProfile } from './codex-attempt.adapter';
import type { AgentAttemptRuntimeAdmissionService } from './agent-attempt-runtime-admission.service';

export class AgentAttemptExecutorService {
  private readonly finalizers = new Map<string, Promise<void>>();

  constructor(
    private readonly files: AttemptFilesystemService,
    private readonly processes: AgentAttemptProcessRegistry,
    private readonly controls: AttemptLiveControlRegistry,
    private readonly broker?: Pick<AttemptMcpBrokerService, 'listen' | 'close'>,
    private readonly spawnProcess: typeof spawn = spawn,
    private readonly maxElapsedMs = 30 * 60 * 1_000,
    private readonly admission?: Pick<AgentAttemptRuntimeAdmissionService, 'assert'>,
  ) {}

  async start(input: {
    attemptId: string;
    runtime: 'codex_cli' | 'claude_cli';
    profile: AttemptRuntimeProfile;
    prompt: string;
    mcp?: Omit<AttemptMcpBinding, 'socketPath' | 'processGroupId'>;
  }) {
    rejectUnsafeAttemptInput(input.prompt, input.profile);
    if (this.admission) {
      if (!input.mcp) throw new Error('attempt_mcp_binding_required');
      await this.admission.assert(input.mcp, input.runtime);
    }
    const paths = await this.files.create(input.attemptId);
    try {
      const command = input.runtime === 'codex_cli'
        ? buildCodexAttemptCommand({ workspace: paths.workspace, socketPath: paths.socketPath, mcpConfigPath: paths.mcpConfigPath, profile: input.profile })
        : buildClaudeAttemptCommand({ workspace: paths.workspace, socketPath: paths.socketPath, mcpConfigPath: paths.mcpConfigPath, profile: input.profile });
      // detached creates the Attempt-owned process group. We keep stdio and event handlers attached.
      const child = this.spawnProcess(command.bin, command.args, {
        cwd: command.cwd, env: command.env, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (!child.pid) throw new Error('attempt_process_pid_missing');
      this.processes.register(input.attemptId, child);
      child.once('error', () => { void this.complete(input.attemptId, paths, true); });
      child.once('exit', () => { void this.complete(input.attemptId, paths, false); });
      if (this.broker) {
        if (!input.mcp) throw new Error('attempt_mcp_binding_required');
        await this.broker.listen({ ...input.mcp, socketPath: paths.socketPath, processGroupId: child.pid });
      }
      this.controls.register(input.attemptId, {
        send: async (message) => { child.stdin.write(`${message}\n`); },
        interrupt: async () => { await this.complete(input.attemptId, paths, true); },
      });
      const timeout = setTimeout(() => { void this.complete(input.attemptId, paths, true); }, this.maxElapsedMs);
      this.timeouts.set(input.attemptId, timeout);
      child.stdin.end(input.prompt);
      return { child, paths };
    } catch (error) {
      await this.complete(input.attemptId, paths, true);
      throw error;
    }
  }

  async cleanup(attemptId: string, paths: AttemptFilesystemPaths): Promise<void> {
    await this.complete(attemptId, paths, true);
  }

  private readonly timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  private complete(attemptId: string, paths: AttemptFilesystemPaths, terminate: boolean): Promise<void> {
    const existing = this.finalizers.get(attemptId);
    if (existing) return existing;
    const finalizer = (async () => {
      const timeout = this.timeouts.get(attemptId);
      if (timeout) clearTimeout(timeout);
      this.timeouts.delete(attemptId);
      if (terminate) await this.processes.terminate(attemptId);
      else this.processes.remove(attemptId);
      this.controls.remove(attemptId);
      await this.broker?.close(paths.socketPath);
      await this.files.remove(paths);
    })();
    this.finalizers.set(attemptId, finalizer);
    return finalizer;
  }
}

function rejectUnsafeAttemptInput(prompt: string, profile: AttemptRuntimeProfile): void {
  const values = [prompt, ...profile.settings ?? []].join('\n');
  if (/--(?:resume|session|budget)|KIDITEM_MCP_EXECUTION_CONTEXT|DATABASE_URL|NEST_|HMAC|credential|provider-history/i.test(values)) {
    throw new Error('attempt_runtime_input_forbidden');
  }
}
