import { createHash, randomUUID } from 'node:crypto';
import {
  MAX_RUNNER_COMMANDS,
  RunnerCommandBatchSchema,
  type AttemptLaunchSpec,
  type RunnerCommand,
  type RunnerCommandBatch,
  type RunnerInputCommand,
  type RunnerInterruptCommand,
  type RunnerStartCommand,
} from '@kiditem/shared/agent-runtime';

const DEFAULT_MAX_ENTRIES = 1_024;

type CommandRecord = {
  command: RunnerCommand;
  idempotencyKey?: string;
};

type StartState = {
  fingerprint: string;
  commandId: string;
  commandHash: string;
  deadlineAt: string;
};

type AcknowledgementTombstone = {
  attemptId: string;
  commandHash: string;
};

export interface RunnerCommandQueueOptions {
  commandId?: () => string;
  maxEntries?: number;
}

export type CanonicalStartInput = Omit<AttemptLaunchSpec, 'attemptToken'> & {
  attemptTokenDigest: string;
};

/**
 * Bounded process-memory at-least-once command storage. The raw Attempt token
 * exists only in an active, unacknowledged start command. Acknowledgements use
 * bounded metadata tombstones so they free queue capacity without allowing a
 * same Attempt to relaunch.
 */
export class RunnerCommandQueue {
  private readonly createCommandId: () => string;
  private readonly maxEntries: number;
  private readonly records = new Map<string, CommandRecord>();
  private readonly startStates = new Map<string, StartState>();
  private readonly idempotency = new Map<string, string>();
  private readonly idempotencyTombstones = new Map<string, RunnerInputCommand | RunnerInterruptCommand>();
  private readonly acknowledgements = new Map<string, AcknowledgementTombstone>();
  private readonly terminalAttempts = new Set<string>();
  private readonly listeners = new Set<() => void>();

  constructor(options: RunnerCommandQueueOptions = {}) {
    this.createCommandId = options.commandId ?? randomUUID;
    this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  }

  enqueueStart(input: { launch: AttemptLaunchSpec; deadlineAt: Date }): RunnerStartCommand {
    const attemptId = input.launch.attemptId;
    if (this.terminalAttempts.has(attemptId)) throw new Error('attempt_terminal');
    const fingerprint = hash(canonicalStartCommandInput(input));
    const existing = this.startStates.get(attemptId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error('runner_start_command_conflict');
      const active = this.records.get(existing.commandId)?.command;
      if (active?.kind === 'attempt.start') return active;
      // The original raw token was discarded on acknowledgement. Rehydrate a
      // response value from the caller's same canonical token without putting
      // it back into the delivery queue.
      return {
        kind: 'attempt.start',
        commandId: existing.commandId,
        attemptId,
        deadlineAt: existing.deadlineAt,
        commandHash: existing.commandHash,
        launch: immutableLaunch(input.launch),
      };
    }
    this.makeRoom();
    this.makeStartStateRoom();
    const command: RunnerStartCommand = {
      kind: 'attempt.start',
      commandId: this.createCommandId(),
      attemptId,
      deadlineAt: input.deadlineAt.toISOString(),
      commandHash: fingerprint,
      launch: immutableLaunch(input.launch),
    };
    this.add(command);
    this.startStates.set(attemptId, {
      fingerprint,
      commandId: command.commandId,
      commandHash: command.commandHash,
      deadlineAt: command.deadlineAt,
    });
    return command;
  }

  enqueueInput(input: { attemptId: string; input: string; deadlineAt: Date }): RunnerInputCommand {
    this.assertNotTerminal(input.attemptId);
    const key = `input\u0000${input.attemptId}\u0000${hash(input.input)}`;
    const existing = this.idempotentCommand(key);
    if (existing?.kind === 'attempt.input') return existing;
    const fingerprint = hash({ kind: 'attempt.input', attemptId: input.attemptId, input: input.input, deadlineAt: input.deadlineAt.toISOString() });
    const command: RunnerInputCommand = {
      kind: 'attempt.input', commandId: this.createCommandId(), attemptId: input.attemptId,
      deadlineAt: input.deadlineAt.toISOString(), commandHash: fingerprint, input: input.input,
    };
    this.add(command, key);
    return command;
  }

  enqueueInterrupt(input: { attemptId: string; deadlineAt: Date }): RunnerInterruptCommand {
    this.assertNotTerminal(input.attemptId);
    const key = `interrupt\u0000${input.attemptId}`;
    const existing = this.idempotentCommand(key);
    if (existing?.kind === 'attempt.interrupt') return existing;
    const fingerprint = hash({ kind: 'attempt.interrupt', attemptId: input.attemptId, deadlineAt: input.deadlineAt.toISOString() });
    const command: RunnerInterruptCommand = {
      kind: 'attempt.interrupt', commandId: this.createCommandId(), attemptId: input.attemptId,
      deadlineAt: input.deadlineAt.toISOString(), commandHash: fingerprint,
    };
    this.add(command, key);
    return command;
  }

  take(): RunnerCommandBatch {
    return RunnerCommandBatchSchema.parse({
      commands: [...this.records.values()].slice(0, MAX_RUNNER_COMMANDS).map((record) => record.command),
    });
  }

  acknowledge(input: { commandId: string; attemptId: string; commandHash: string }): void {
    const record = this.records.get(input.commandId);
    if (!record) {
      const acknowledged = this.acknowledgements.get(input.commandId);
      if (acknowledged && acknowledged.attemptId === input.attemptId && acknowledged.commandHash === input.commandHash) return;
      throw new Error('runner_command_ack_invalid');
    }
    if (record.command.attemptId !== input.attemptId || record.command.commandHash !== input.commandHash) {
      throw new Error('runner_command_ack_invalid');
    }
    this.records.delete(input.commandId);
    this.remember(this.acknowledgements, input.commandId, {
      attemptId: record.command.attemptId,
      commandHash: record.command.commandHash,
    });
    if (record.idempotencyKey) {
      this.idempotency.delete(record.idempotencyKey);
      if (record.command.kind === 'attempt.input' || record.command.kind === 'attempt.interrupt') {
        this.remember(this.idempotencyTombstones, record.idempotencyKey, record.command);
      }
    }
  }

  markTerminal(attemptId: string): void {
    this.remember(this.terminalAttempts, attemptId);
    this.startStates.delete(attemptId);
    for (const [commandId, record] of this.records) {
      if (record.command.attemptId !== attemptId) continue;
      // Preserve only the safe command coordinate/hash so an exact rejected
      // event retry remains attributable after terminal cleanup.
      this.remember(this.acknowledgements, commandId, {
        attemptId: record.command.attemptId,
        commandHash: record.command.commandHash,
      });
      this.records.delete(commandId);
      if (record.idempotencyKey) this.idempotency.delete(record.idempotencyKey);
    }
    for (const [key, command] of this.idempotencyTombstones) {
      if (command.attemptId === attemptId) this.idempotencyTombstones.delete(key);
    }
  }

  has(commandId: string): boolean {
    return this.records.has(commandId);
  }

  /** Returns an active start command only; acknowledged starts contain no raw token. */
  startForAttempt(attemptId: string): RunnerStartCommand | null {
    const state = this.startStates.get(attemptId);
    const command = state ? this.records.get(state.commandId)?.command : undefined;
    return command?.kind === 'attempt.start' ? command : null;
  }

  /** Acknowledged starts are still owned by the Runner, but are never redelivered. */
  hasStartedAttempt(attemptId: string): boolean {
    return this.startStates.has(attemptId);
  }

  commandAttempt(commandId: string): string | null {
    return this.records.get(commandId)?.command.attemptId
      ?? this.acknowledgements.get(commandId)?.attemptId
      ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private idempotentCommand(key: string): RunnerInputCommand | RunnerInterruptCommand | null {
    const activeId = this.idempotency.get(key);
    if (activeId) {
      const active = this.records.get(activeId)?.command;
      if (active?.kind === 'attempt.input' || active?.kind === 'attempt.interrupt') return active;
      this.idempotency.delete(key);
    }
    return this.idempotencyTombstones.get(key) ?? null;
  }

  private add(command: RunnerCommand, idempotencyKey?: string): void {
    this.makeRoom();
    this.records.set(command.commandId, { command, ...(idempotencyKey ? { idempotencyKey } : {}) });
    if (idempotencyKey) this.idempotency.set(idempotencyKey, command.commandId);
    for (const listener of this.listeners) listener();
  }

  private makeRoom(): void {
    if (this.records.size >= this.maxEntries) throw new Error('runner_command_backpressure');
  }

  private makeStartStateRoom(): void {
    if (this.startStates.size >= this.maxEntries) throw new Error('runner_command_backpressure');
  }

  private assertNotTerminal(attemptId: string): void {
    if (this.terminalAttempts.has(attemptId)) throw new Error('attempt_terminal');
  }

  private remember<T>(map: Map<string, T>, key: string, value: T): void;
  private remember(set: Set<string>, value: string): void;
  private remember<T>(target: Map<string, T> | Set<string>, key: string, value?: T): void {
    if (target instanceof Map) {
      target.set(key, value as T);
      while (target.size > this.maxEntries) target.delete(target.keys().next().value as string);
      return;
    }
    target.add(key);
    while (target.size > this.maxEntries) target.delete(target.values().next().value as string);
  }
}

export function canonicalStartInputForHash(launch: AttemptLaunchSpec): CanonicalStartInput {
  const { attemptToken, ...rest } = launch;
  return Object.freeze({
    ...rest,
    attemptTokenDigest: createHash('sha256').update(attemptToken).digest('hex'),
  });
}

function canonicalStartCommandInput(input: { launch: AttemptLaunchSpec; deadlineAt: Date }): object {
  return { launch: canonicalStartInputForHash(input.launch), deadlineAt: input.deadlineAt.toISOString() };
}

function immutableLaunch(launch: AttemptLaunchSpec): AttemptLaunchSpec {
  return Object.freeze({ ...launch });
}

function hash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}
