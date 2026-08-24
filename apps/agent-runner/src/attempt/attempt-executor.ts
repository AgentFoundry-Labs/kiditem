import type { AgentResultEnvelope } from '@kiditem/shared/agent-interaction';
import type { AttemptLaunchSpec, RunnerEvent } from '@kiditem/shared/agent-runtime';
import { AttemptLaunchSpecSchema } from '@kiditem/shared/agent-runtime';
import { buildProviderCommand } from '../provider/provider-command';
import { ClaudeStreamParser } from '../provider/claude-stream-parser';
import { CodexAppServerSession, type CodexAppServerEvent } from '../provider/codex-app-server-session';
import { redactForRunnerEvent, safeDiagnostic } from '../security/redaction';
import type { ProcessExit, ProcessSupervisor, SupervisedProcess } from '../platform/process-supervisor';
import { AttemptProcessRegistry } from './attempt-process.registry';
import type { AttemptWorkspacePaths } from './attempt-workspace.service';

type WorkspacePort = {
  create(launch: AttemptLaunchSpec): Promise<AttemptWorkspacePaths>;
  linkProviderAuth(paths: AttemptWorkspacePaths, runtime: AttemptLaunchSpec['runtime']): Promise<void>;
  remove(paths: AttemptWorkspacePaths): Promise<void>;
};

type ActiveAttempt = {
  launch: AttemptLaunchSpec;
  paths: AttemptWorkspacePaths;
  process: SupervisedProcess;
  codex?: CodexAppServerSession;
  claude?: ClaudeStreamParser;
  result?: AgentResultEnvelope;
  timeout: ReturnType<typeof setTimeout>;
  initializing: boolean;
  pendingCodexCompletion?: Extract<CodexAppServerEvent, { kind: 'turn_completed' }>;
};

/** Executes provider protocol processes behind a Runner-only workspace/supervisor boundary. */
export class AttemptExecutor {
  private readonly registry: AttemptProcessRegistry;
  private readonly active = new Map<string, ActiveAttempt>();
  private readonly terminalizing = new Set<string>();

  constructor(private readonly options: Readonly<{
    runtimeRoot: string;
    workspaces: WorkspacePort;
    supervisor: ProcessSupervisor;
    emit: (event: RunnerEvent) => void;
    registry?: AttemptProcessRegistry;
  }>) {
    this.registry = options.registry ?? new AttemptProcessRegistry();
  }

  async start(input: AttemptLaunchSpec): Promise<void> {
    const launch = AttemptLaunchSpecSchema.parse(input);
    if (this.active.has(launch.attemptId)) return;
    let paths: AttemptWorkspacePaths | undefined;
    let process: SupervisedProcess | undefined;
    let installed = false;
    let earlyExit: ProcessExit | undefined;
    let codex: CodexAppServerSession | undefined;
    try {
      paths = await this.options.workspaces.create(launch);
      await this.options.workspaces.linkProviderAuth(paths, launch.runtime);
      const command = buildProviderCommand(launch, paths, this.options.runtimeRoot);
      process = await this.options.supervisor.launch(command, {
        onStdout: (chunk) => this.handleStdout(launch.attemptId, chunk),
        // Never upload/log raw provider stderr; terminal errors are classified only.
        onStderr: () => undefined,
        onExit: (exit) => {
          codex?.close();
          if (!installed) { earlyExit ??= exit; return; }
          this.defer(() => { void this.finish(launch.attemptId, exit.code === 0 ? 'success' : 'nonzero_exit'); });
        },
      });
      const supervisedProcess = process;
      if (launch.runtime === 'codex_cli') {
        codex = new CodexAppServerSession((line) => supervisedProcess.input(line), undefined, (event) => this.handleCodexNotification(launch.attemptId, event));
      }
      const active: ActiveAttempt = {
        launch,
        paths,
        process: supervisedProcess,
        ...(codex
          ? { codex }
          : { claude: new ClaudeStreamParser({ redactionTokens: [launch.attemptToken] }) }),
        timeout: setTimeout(() => { void this.timeout(launch.attemptId); }, launch.timeoutMs),
        initializing: true,
      };
      // Install the registry and timeout before any provider protocol input can fail.
      this.active.set(launch.attemptId, active);
      this.registry.register(launch.attemptId, supervisedProcess);
      if (earlyExit) throw new Error('runner_provider_exited_during_start');
      if (active.codex) await active.codex.start({ model: launch.model, cwd: paths.workspace, prompt: launch.prompt });
      else await supervisedProcess.input(`${JSON.stringify({ type: 'user', message: { role: 'user', content: launch.prompt } })}\n`);
      if (earlyExit) throw new Error('runner_provider_exited_during_start');
      active.initializing = false;
      installed = true;
      if (active.pendingCodexCompletion) {
        const completion = active.pendingCodexCompletion;
        active.pendingCodexCompletion = undefined;
        this.defer(() => { void this.completeCodexTurn(launch.attemptId, completion); });
      }
    } catch (error) {
      installed = true;
      await this.abortStart(launch.attemptId, paths, process);
      throw error;
    }
  }

  async input(attemptId: string, input: string): Promise<void> {
    const active = this.active.get(attemptId);
    if (!active || active.initializing) throw new Error('runner_attempt_not_live');
    if (active.codex) await active.codex.steer(input);
    else await this.registry.input(attemptId, `${JSON.stringify({ type: 'user', message: { role: 'user', content: input } })}\n`);
  }

  async interrupt(attemptId: string): Promise<void> {
    const active = this.active.get(attemptId);
    if (!active) return;
    await active.codex?.interrupt().catch(() => undefined);
    await this.finish(attemptId, 'interrupted', true);
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.active.keys()].map((attemptId) => this.interrupt(attemptId)));
    await this.options.supervisor.shutdown();
  }

  private handleStdout(attemptId: string, chunk: string): void {
    const active = this.active.get(attemptId);
    if (!active) return;
    try {
      if (active.codex) active.codex.receive(chunk);
      else if (active.claude) {
        const update = active.claude.receive(chunk);
        for (const output of update.output) this.emitOutput(active.launch, output);
        if (update.result) active.result = update.result;
      }
    } catch {
      void this.finish(attemptId, 'runtime_error', true);
    }
  }

  private handleCodexNotification(attemptId: string, event: CodexAppServerEvent): void {
    const active = this.active.get(attemptId);
    if (!active) return;
    if (event.kind === 'agent_message_delta') {
      this.emitOutput(active.launch, event.delta);
      return;
    }
    if (active.initializing) {
      active.pendingCodexCompletion = event;
      return;
    }
    this.defer(() => { void this.completeCodexTurn(attemptId, event); });
  }

  private async completeCodexTurn(attemptId: string, event: Extract<CodexAppServerEvent, { kind: 'turn_completed' }>): Promise<void> {
    const active = this.active.get(attemptId);
    if (!active) return;
    if (event.status === 'completed') {
      if (!event.result) { await this.finish(attemptId, 'runtime_error', true); return; }
      active.result = event.result;
      await this.finish(attemptId, 'protocol_success', true);
      return;
    }
    await this.finish(attemptId, event.status === 'interrupted' ? 'interrupted' : 'runtime_error', true);
  }

  private emitOutput(launch: AttemptLaunchSpec, value: string): void {
    const output = redactForRunnerEvent(value, [launch.attemptToken]).trim();
    if (output) this.options.emit({ kind: 'attempt.output', attemptId: launch.attemptId, output });
  }

  private async timeout(attemptId: string): Promise<void> { await this.finish(attemptId, 'timeout', true); }

  /** Termination is complete-tree first, so no child can retain the workspace afterwards. */
  private async finish(
    attemptId: string,
    terminalReason: Extract<RunnerEvent, { kind: 'attempt.terminal' }>['terminalReason'],
    terminateProcess = false,
  ): Promise<void> {
    if (this.terminalizing.has(attemptId)) return;
    const active = this.active.get(attemptId); if (!active) return;
    this.terminalizing.add(attemptId);
    clearTimeout(active.timeout);
    this.active.delete(attemptId);
    try {
      if (terminateProcess) await this.registry.interrupt(attemptId);
      else this.registry.remove(attemptId);
    } catch {
      // Process termination is best-effort, but all local lifecycle cleanup still runs.
      safeDiagnostic(undefined);
    }
    try {
      this.options.emit({
        kind: 'attempt.terminal', attemptId, terminalReason,
        ...(active.result ? { result: active.result } : {}),
      });
    } catch {
      // The control outbox is memory-only. Never retain a provider tree/workspace on delivery failure.
      safeDiagnostic(undefined);
    } finally {
      await this.options.workspaces.remove(active.paths).catch(() => undefined);
      this.terminalizing.delete(attemptId);
    }
  }

  private async abortStart(attemptId: string, paths?: AttemptWorkspacePaths, process?: SupervisedProcess): Promise<void> {
    const active = this.active.get(attemptId);
    if (active) {
      clearTimeout(active.timeout);
      this.active.delete(attemptId);
    }
    try {
      if (this.registry.get(attemptId)) await this.registry.interrupt(attemptId);
      else await process?.terminate();
    } finally {
      if (paths) await this.options.workspaces.remove(paths).catch(() => undefined);
    }
  }

  private defer(work: () => void): void { setTimeout(work, 0); }
}
