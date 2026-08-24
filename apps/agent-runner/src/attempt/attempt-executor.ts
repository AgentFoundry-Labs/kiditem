import type { AgentResultEnvelope } from '@kiditem/shared/agent-interaction';
import type { AttemptLaunchSpec, RunnerEvent } from '@kiditem/shared/agent-runtime';
import { AttemptLaunchSpecSchema } from '@kiditem/shared/agent-runtime';
import { buildProviderCommand } from '../provider/provider-command';
import { ClaudeStreamParser } from '../provider/claude-stream-parser';
import { CodexAppServerSession, type CodexAppServerEvent } from '../provider/codex-app-server-session';
import { redactForRunnerEvent } from '../security/redaction';
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
  private readonly terminalizing = new Map<string, Promise<void>>();
  private readonly failedTerminalizations = new Set<string>();
  private fatalError: Error | null = null;

  constructor(private readonly options: Readonly<{
    runtimeRoot: string;
    workspaces: WorkspacePort;
    supervisor: ProcessSupervisor;
    emit: (event: RunnerEvent) => void;
    registry?: AttemptProcessRegistry;
    /** The native Runner exits after this callback, allowing watchdog/job ownership to kill unresolved trees. */
    onFatal?: (error: Error) => void;
  }>) {
    this.registry = options.registry ?? new AttemptProcessRegistry();
  }

  async start(input: AttemptLaunchSpec): Promise<void> {
    const launch = AttemptLaunchSpecSchema.parse(input);
    if (this.fatalError) throw this.fatalError;
    if (this.active.has(launch.attemptId)) return;
    let paths: AttemptWorkspacePaths | undefined;
    let process: SupervisedProcess | undefined;
    let installed = false;
    let earlyExit: ProcessExit | undefined;
    let codex: CodexAppServerSession | undefined;
    let active: ActiveAttempt | undefined;
    try {
      paths = await this.options.workspaces.create(launch);
      await this.options.workspaces.linkProviderAuth(paths, launch.runtime);
      const command = buildProviderCommand(launch, paths, this.options.runtimeRoot);
      process = await this.options.supervisor.launch(command, {
        onStdout: (chunk) => this.handleStdout(launch.attemptId, chunk),
        // Never upload/log raw provider stderr; terminal errors are classified only.
        onStderr: () => undefined,
        onFatal: (error) => this.reportFatal(error),
        onExit: (exit) => {
          codex?.close();
          if (!installed) { earlyExit ??= exit; return; }
          if (this.active.get(launch.attemptId)?.pendingCodexCompletion) return;
          this.defer(() => this.finish(launch.attemptId, exit.code === 0 ? 'success' : 'nonzero_exit'));
        },
      });
      const supervisedProcess = process;
      if (launch.runtime === 'codex_cli') {
        codex = new CodexAppServerSession((line) => supervisedProcess.input(line), undefined, (event) => this.handleCodexNotification(launch.attemptId, event));
      }
      active = {
        launch,
        paths,
        process: supervisedProcess,
        ...(codex
          ? { codex }
          : { claude: new ClaudeStreamParser({ redactionTokens: [launch.attemptToken] }) }),
        timeout: setTimeout(() => { void this.timeout(launch.attemptId).catch((error) => this.reportFatal(error)); }, launch.timeoutMs),
        initializing: true,
      };
      // Install the registry and timeout before any provider protocol input can fail.
      this.active.set(launch.attemptId, active);
      this.registry.register(launch.attemptId, supervisedProcess);
      if (earlyExit) throw new Error('runner_provider_exited_during_start');
      if (active.codex) {
        await active.codex.start({
          model: launch.model,
          cwd: paths.workspace,
          prompt: launch.prompt,
          readinessProbeNonce: launch.readinessProbeNonce,
        });
      }
      else await supervisedProcess.input(`${JSON.stringify({ type: 'user', message: { role: 'user', content: launch.prompt } })}\n`);
      if (earlyExit) throw new Error('runner_provider_exited_during_start');
      active.initializing = false;
      installed = true;
      if (active.pendingCodexCompletion) {
        const completion = active.pendingCodexCompletion;
        this.defer(() => this.completeCodexTurn(launch.attemptId, completion));
      }
    } catch (error) {
      if (active?.pendingCodexCompletion && this.active.get(launch.attemptId) === active) {
        // A structured turn terminal is authoritative even if app-server exits
        // before it answers turn/start. Defer completion so the dispatcher can
        // acknowledge/start in order, then terminalize once after tree death.
        active.initializing = false;
        installed = true;
        const completion = active.pendingCodexCompletion;
        this.defer(() => this.completeCodexTurn(launch.attemptId, completion));
        return;
      }
      try {
        await this.abortStart(launch.attemptId, paths, process);
      } catch (cleanupError) {
        this.reportFatal(cleanupError);
        throw new AggregateError([error, cleanupError], 'runner_attempt_start_cleanup_failed');
      }
      throw error;
    }
  }

  async input(attemptId: string, input: string): Promise<void> {
    const active = this.active.get(attemptId);
    if (!active || active.initializing || this.terminalizing.has(attemptId) || this.failedTerminalizations.has(attemptId)) {
      throw new Error('runner_attempt_not_live');
    }
    if (active.codex) await active.codex.steer(input);
    else await this.registry.input(attemptId, `${JSON.stringify({ type: 'user', message: { role: 'user', content: input } })}\n`);
  }

  async interrupt(attemptId: string): Promise<void> {
    const active = this.active.get(attemptId);
    if (!active) return;
    const results = await Promise.allSettled([
      ...(active.codex ? [active.codex.interrupt()] : []),
      this.finish(attemptId, 'interrupted', true),
    ]);
    throwIfRejected(results, 'runner_attempt_interrupt_failed');
  }

  async shutdown(): Promise<void> {
    const results = await Promise.allSettled([
      ...[...this.active.keys()].map((attemptId) => this.interrupt(attemptId)),
      this.registry.interruptAll(),
      this.options.supervisor.shutdown(),
    ]);
    const errors = rejectedErrors(results);
    if (this.fatalError) errors.push(this.fatalError);
    if (errors.length) throw new AggregateError(errors, 'runner_attempt_kill_all_failed');
  }

  private handleStdout(attemptId: string, chunk: string): void {
    const active = this.active.get(attemptId);
    if (!active) return;
    try {
      if (active.codex) active.codex.receive(chunk);
      else if (active.claude) {
        const update = active.claude.receive(chunk);
        for (const output of update.output) this.emitOutput(active.launch, output);
        if (update.providerFailure) {
          void this.finish(attemptId, 'runtime_error', true).catch((error) => this.reportFatal(error));
          return;
        }
        if (update.result) active.result = update.result;
      }
    } catch {
      void this.finish(attemptId, 'runtime_error', true).catch((error) => this.reportFatal(error));
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
    this.defer(() => this.completeCodexTurn(attemptId, event));
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
    await this.finish(attemptId, 'runtime_error', true);
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
    const running = this.terminalizing.get(attemptId);
    if (running) return running;
    const active = this.active.get(attemptId); if (!active) return;
    const terminalization = this.finishActive(active, terminalReason, terminateProcess);
    this.terminalizing.set(attemptId, terminalization);
    try {
      await terminalization;
    } finally {
      if (this.terminalizing.get(attemptId) === terminalization) this.terminalizing.delete(attemptId);
    }
  }

  private async abortStart(attemptId: string, paths?: AttemptWorkspacePaths, process?: SupervisedProcess): Promise<void> {
    const active = this.active.get(attemptId);
    if (active) clearTimeout(active.timeout);
    if (this.registry.get(attemptId)) await this.registry.interrupt(attemptId);
    else await process?.terminate();
    // A failed start has no terminal event, but it still cannot release a live tree's workspace.
    if (paths) await this.options.workspaces.remove(paths);
    if (active) {
      this.active.delete(attemptId);
      this.failedTerminalizations.delete(attemptId);
    }
  }

  private async finishActive(
    active: ActiveAttempt,
    terminalReason: Extract<RunnerEvent, { kind: 'attempt.terminal' }>['terminalReason'],
    terminateProcess: boolean,
  ): Promise<void> {
    const attemptId = active.launch.attemptId;
    clearTimeout(active.timeout);
    try {
      if (terminateProcess) await this.registry.interrupt(attemptId);
      else this.registry.confirmExited(attemptId);
      // Never release a workspace or report terminal state before the tree is known dead.
      await this.options.workspaces.remove(active.paths);
      this.options.emit({
        kind: 'attempt.terminal', attemptId, terminalReason,
        ...(active.result ? { result: active.result } : {}),
      });
      this.active.delete(attemptId);
      this.failedTerminalizations.delete(attemptId);
    } catch (error) {
      this.failedTerminalizations.add(attemptId);
      this.reportFatal(error);
      throw error;
    }
  }

  private reportFatal(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error('runner_attempt_terminalization_failed');
    if (this.fatalError) return;
    this.fatalError = normalized;
    try { this.options.onFatal?.(normalized); } catch { /* no logging at the credential/process boundary */ }
  }

  private defer(work: () => Promise<void>): void {
    setTimeout(() => { void work().catch((error) => this.reportFatal(error)); }, 0);
  }
}

function rejectedErrors(results: readonly PromiseSettledResult<unknown>[]): unknown[] {
  return results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
}

function throwIfRejected(results: readonly PromiseSettledResult<unknown>[], message: string): void {
  const errors = rejectedErrors(results);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}
