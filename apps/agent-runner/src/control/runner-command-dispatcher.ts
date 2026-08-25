import { RunnerCommandSchema, type AttemptLaunchSpec, type RunnerCommand } from '@kiditem/shared/agent-runtime';
import { RunnerEventOutbox } from './runner-event-outbox';

export interface AttemptExecutorPort {
  start(launch: AttemptLaunchSpec): Promise<void>;
  input(attemptId: string, input: string): Promise<void>;
  interrupt(attemptId: string): Promise<void>;
}

type AttemptState = { launchHash: string; appliedCommandHashes: Map<string, string> };
type TerminalAttemptState = Readonly<{
  launchHash: string;
  rejectedStart?: Readonly<{ commandId: string; commandHash: string }>;
}>;
const MAX_COMMAND_TOMBSTONES = 1_024;
const MAX_LIVE_ATTEMPTS = 1_024;
const MAX_TERMINAL_ATTEMPTS = 1_024;

/** Applies queued commands exactly once in the Runner process after local state is installed. */
export class RunnerCommandDispatcher {
  readonly outbox: RunnerEventOutbox;
  private readonly attempts = new Map<string, AttemptState>();
  private readonly terminalAttempts = new Map<string, TerminalAttemptState>();
  private readonly maxAttempts: number;
  private readonly now: () => Date;

  constructor(private readonly options: Readonly<{
    executor: AttemptExecutorPort;
    outbox: RunnerEventOutbox;
    maxAttempts?: number;
    now?: () => Date;
  }>) {
    this.outbox = options.outbox;
    this.maxAttempts = options.maxAttempts ?? MAX_LIVE_ATTEMPTS;
    this.now = options.now ?? (() => new Date());
  }

  async dispatch(input: RunnerCommand): Promise<void> {
    const command = RunnerCommandSchema.parse(input);
    const state = this.attempts.get(command.attemptId);
    const terminal = this.terminalAttempts.get(command.attemptId);
    if (
      command.kind === 'attempt.start' &&
      terminal?.rejectedStart?.commandId === command.commandId
    ) {
      if (terminal.rejectedStart.commandHash === command.commandHash) return;
      this.reject(command, 'conflict'); return;
    }
    if (command.kind === 'attempt.start' && terminal) {
      this.reject(command, 'invalid_state'); return;
    }
    if (state?.appliedCommandHashes.get(command.commandId) === command.commandHash) {
      this.ack(command); return;
    }
    if (state?.appliedCommandHashes.has(command.commandId)) {
      this.reject(command, 'conflict'); return;
    }
    if (command.kind === 'attempt.start') return this.start(command, state);
    // `deadlineAt` is an admission deadline only for a new local process.
    // Input/interrupt can be host cleanup commands stamped at dispatch time;
    // rejecting an expired cleanup interrupt would leave an already-live local
    // process orphaned. Their installed-attempt identity is the safe boundary.
    if (!state) { this.reject(command, 'invalid_state'); return; }
    if (command.kind === 'attempt.input') await this.options.executor.input(command.attemptId, command.input);
    else await this.options.executor.interrupt(command.attemptId);
    this.remember(state, command.commandId, command.commandHash);
    this.ack(command);
  }

  markTerminal(attemptId: string): void {
    const state = this.attempts.get(attemptId);
    if (!state) return;
    this.attempts.delete(attemptId);
    this.rememberTerminal(attemptId, state.launchHash);
  }

  async shutdown(): Promise<void> {
    const results = await Promise.allSettled([...this.attempts.entries()].map(async ([attemptId, state]) => {
      await this.options.executor.interrupt(attemptId);
      this.attempts.delete(attemptId);
      this.rememberTerminal(attemptId, state.launchHash);
    }));
    const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
    if (errors.length) throw new AggregateError(errors, 'runner_dispatcher_shutdown_failed');
  }

  private async start(command: Extract<RunnerCommand, { kind: 'attempt.start' }>, state: AttemptState | undefined): Promise<void> {
    if (state) {
      if (state.launchHash !== command.commandHash) { this.reject(command, 'conflict'); return; }
      this.remember(state, command.commandId, command.commandHash);
      this.ack(command);
      return;
    }
    if (this.attempts.size >= this.maxAttempts) { this.reject(command, 'unsupported'); return; }
    if (Date.parse(command.deadlineAt) <= this.now().getTime()) {
      this.rejectFailedStart(command); return;
    }
    try {
      await this.options.executor.start(command.launch);
    } catch {
      // A local setup/process failure is final for this command. Letting it
      // escape would make the control loop treat it as a transport failure and
      // redeliver the token-bearing start indefinitely.
      this.rejectFailedStart(command); return;
    }
    const installed: AttemptState = { launchHash: command.commandHash, appliedCommandHashes: new Map() };
    this.attempts.set(command.attemptId, installed);
    this.remember(installed, command.commandId, command.commandHash);
    this.ack(command);
    this.outbox.enqueue({ kind: 'attempt.started', attemptId: command.attemptId });
  }

  private ack(command: RunnerCommand): void {
    this.outbox.enqueue({ kind: 'command_ack', commandId: command.commandId, attemptId: command.attemptId, commandHash: command.commandHash });
  }

  private reject(command: RunnerCommand, code: 'conflict' | 'invalid_state' | 'unsupported'): void {
    this.outbox.enqueue({ kind: 'attempt.rejected', commandId: command.commandId, attemptId: command.attemptId, code });
  }

  private rejectFailedStart(command: Extract<RunnerCommand, { kind: 'attempt.start' }>): void {
    this.rememberTerminal(command.attemptId, command.commandHash, { commandId: command.commandId, commandHash: command.commandHash });
    this.reject(command, 'unsupported');
  }

  private remember(state: AttemptState, commandId: string, commandHash: string): void {
    state.appliedCommandHashes.set(commandId, commandHash);
    while (state.appliedCommandHashes.size > MAX_COMMAND_TOMBSTONES) state.appliedCommandHashes.delete(state.appliedCommandHashes.keys().next().value as string);
  }

  private rememberTerminal(
    attemptId: string,
    launchHash: string,
    rejectedStart?: Readonly<{ commandId: string; commandHash: string }>,
  ): void {
    this.terminalAttempts.delete(attemptId);
    this.terminalAttempts.set(attemptId, Object.freeze({ launchHash, ...(rejectedStart ? { rejectedStart } : {}) }));
    while (this.terminalAttempts.size > MAX_TERMINAL_ATTEMPTS) this.terminalAttempts.delete(this.terminalAttempts.keys().next().value as string);
  }
}
