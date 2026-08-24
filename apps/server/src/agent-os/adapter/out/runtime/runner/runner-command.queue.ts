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
  fingerprint: string;
  acknowledged: boolean;
  terminal: boolean;
};

export interface RunnerCommandQueueOptions {
  commandId?: () => string;
  maxEntries?: number;
}

export type CanonicalStartInput = Omit<AttemptLaunchSpec, 'attemptToken'> & {
  attemptTokenDigest: string;
};

/**
 * Bounded process-memory at-least-once command storage. Its only raw Attempt
 * token copy is the unacknowledged start command delivered to the Runner.
 */
export class RunnerCommandQueue {
  private readonly createCommandId: () => string;
  private readonly maxEntries: number;
  private readonly records = new Map<string, CommandRecord>();
  private readonly startsByAttempt = new Map<string, string>();
  private readonly idempotency = new Map<string, string>();
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
    const existingId = this.startsByAttempt.get(attemptId);
    if (existingId) {
      const existing = this.records.get(existingId);
      if (existing?.fingerprint === fingerprint) return existing.command as RunnerStartCommand;
      throw new Error('runner_start_command_conflict');
    }
    const command: RunnerStartCommand = {
      kind: 'attempt.start',
      commandId: this.createCommandId(),
      attemptId,
      deadlineAt: input.deadlineAt.toISOString(),
      commandHash: fingerprint,
      launch: immutableLaunch(input.launch),
    };
    this.add(command, fingerprint);
    this.startsByAttempt.set(attemptId, command.commandId);
    return command;
  }

  enqueueInput(input: { attemptId: string; input: string; deadlineAt: Date }): RunnerInputCommand {
    const fingerprint = hash({ kind: 'attempt.input', attemptId: input.attemptId, input: input.input, deadlineAt: input.deadlineAt.toISOString() });
    // A retried user input retains the first queued command/deadline. The
    // deadline is an admission detail, not part of the caller's command intent.
    const key = `input\u0000${input.attemptId}\u0000${hash(input.input)}`;
    const existing = this.idempotency.get(key);
    if (existing) return this.records.get(existing)?.command as RunnerInputCommand;
    const command: RunnerInputCommand = {
      kind: 'attempt.input', commandId: this.createCommandId(), attemptId: input.attemptId,
      deadlineAt: input.deadlineAt.toISOString(), commandHash: fingerprint, input: input.input,
    };
    this.add(command, fingerprint, key);
    return command;
  }

  enqueueInterrupt(input: { attemptId: string; deadlineAt: Date }): RunnerInterruptCommand {
    const fingerprint = hash({ kind: 'attempt.interrupt', attemptId: input.attemptId, deadlineAt: input.deadlineAt.toISOString() });
    const key = `interrupt\u0000${input.attemptId}`;
    const existing = this.idempotency.get(key);
    if (existing) return this.records.get(existing)?.command as RunnerInterruptCommand;
    const command: RunnerInterruptCommand = {
      kind: 'attempt.interrupt', commandId: this.createCommandId(), attemptId: input.attemptId,
      deadlineAt: input.deadlineAt.toISOString(), commandHash: fingerprint,
    };
    this.add(command, fingerprint, key);
    return command;
  }

  take(): RunnerCommandBatch {
    const commands = [...this.records.values()]
      .filter((record) => !record.acknowledged && !record.terminal)
      .slice(0, MAX_RUNNER_COMMANDS)
      .map((record) => record.command);
    return RunnerCommandBatchSchema.parse({ commands });
  }

  acknowledge(input: { commandId: string; commandHash: string }): void {
    const record = this.records.get(input.commandId);
    if (!record || record.command.commandHash !== input.commandHash) throw new Error('runner_command_ack_invalid');
    record.acknowledged = true;
  }

  markTerminal(attemptId: string): void {
    this.terminalAttempts.add(attemptId);
    if (this.terminalAttempts.size > this.maxEntries) this.terminalAttempts.delete(this.terminalAttempts.values().next().value as string);
    for (const record of this.records.values()) {
      if (record.command.attemptId === attemptId) record.terminal = true;
    }
    this.trim();
  }

  has(commandId: string): boolean {
    return this.records.has(commandId);
  }

  startForAttempt(attemptId: string): RunnerStartCommand | null {
    const commandId = this.startsByAttempt.get(attemptId);
    const record = commandId ? this.records.get(commandId) : undefined;
    return record?.command.kind === 'attempt.start' ? record.command : null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private add(command: RunnerCommand, fingerprint: string, idempotencyKey?: string): void {
    this.records.set(command.commandId, { command, fingerprint, acknowledged: false, terminal: false });
    if (idempotencyKey) this.idempotency.set(idempotencyKey, command.commandId);
    this.trim();
    for (const listener of this.listeners) listener();
  }

  private trim(): void {
    while (this.records.size > this.maxEntries) {
      const terminal = [...this.records.entries()].find(([, record]) => record.terminal);
      if (!terminal) return;
      const [commandId, record] = terminal;
      this.records.delete(commandId);
      if (record.command.kind === 'attempt.start') this.startsByAttempt.delete(record.command.attemptId);
      for (const [key, id] of this.idempotency) if (id === commandId) this.idempotency.delete(key);
    }
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
