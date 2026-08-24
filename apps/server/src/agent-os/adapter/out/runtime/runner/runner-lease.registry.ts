import { randomUUID } from 'node:crypto';
import {
  RunnerEventBatchSchema,
  RunnerHelloSchema,
  type RunnerCommandBatch,
  type RunnerEventAcknowledgement,
  type RunnerEventBatch,
  type RunnerHello,
  type RunnerLeaseResponse,
} from '@kiditem/shared/agent-runtime';
import { RunnerCommandQueue } from './runner-command.queue';

export const RUNNER_EMPTY_POLL_MS = 20_000;
export const RUNNER_LEASE_TTL_MS = 30_000;

type ActiveLease = {
  runnerInstanceId: string;
  leaseId: string;
  helloHash: string;
  status: 'probing' | 'ready';
  lastSeenAt: number;
  attempts: Set<string>;
  nextEventSeq: number;
  eventAcks: Map<number, { bodyHash: string; acknowledgement: RunnerEventAcknowledgement }>;
  expiresTimer: ReturnType<typeof setTimeout>;
};

type PendingPoll = {
  leaseId: string;
  resolve: (value: RunnerCommandBatch) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export interface RunnerLeaseRegistryOptions {
  commands: RunnerCommandQueue;
  interruptAttempt: (attemptId: string) => Promise<void>;
  revokeLease?: (leaseId: string) => void;
  leaseId?: () => string;
  now?: () => Date;
}

/** One bounded control lease and at most one open long poll, held only in API memory. */
export class RunnerLeaseRegistry {
  private readonly commands: RunnerCommandQueue;
  private interruptAttempt: (attemptId: string) => Promise<void>;
  private revokeLease: (leaseId: string) => void;
  private readonly createLeaseId: () => string;
  private readonly now: () => Date;
  private readonly unsubscribe: () => void;
  private active: ActiveLease | null = null;
  private pending: PendingPoll | null = null;

  constructor(options: RunnerLeaseRegistryOptions) {
    this.commands = options.commands;
    this.interruptAttempt = options.interruptAttempt;
    this.revokeLease = options.revokeLease ?? (() => undefined);
    this.createLeaseId = options.leaseId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
    this.unsubscribe = this.commands.subscribe(() => this.resolvePendingFromQueue());
  }

  hello(input: RunnerHello): RunnerLeaseResponse {
    const hello = RunnerHelloSchema.parse(input);
    const helloHash = stableJson(hello);
    const active = this.active;
    if (active && active.runnerInstanceId === hello.runnerInstanceId) {
      if (active.helloHash !== helloHash) throw new Error('runner_hello_conflict');
      this.touch(active);
      return this.response(active);
    }
    if (this.active) this.invalidate(this.active);
    const lease: ActiveLease = {
      runnerInstanceId: hello.runnerInstanceId,
      leaseId: this.createLeaseId(),
      helloHash,
      status: 'probing',
      lastSeenAt: this.now().getTime(),
      attempts: new Set(),
      nextEventSeq: 1,
      eventAcks: new Map(),
      expiresTimer: setTimeout(() => this.expireCurrent(hello.runnerInstanceId), RUNNER_LEASE_TTL_MS),
    };
    this.active = lease;
    return this.response(lease);
  }

  markReady(input: { runnerInstanceId: string; leaseId: string }): RunnerLeaseResponse {
    const lease = this.require(input);
    lease.status = 'ready';
    return this.response(lease);
  }

  /** Binds final lifecycle hooks without putting control state in a database. */
  setLossHandlers(input: {
    interruptAttempt: (attemptId: string) => Promise<void>;
    revokeLease: (leaseId: string) => void;
  }): void {
    this.interruptAttempt = input.interruptAttempt;
    this.revokeLease = input.revokeLease;
  }

  isValid(input: { runnerInstanceId: string; leaseId: string }): boolean {
    const lease = this.active;
    return !!lease
      && lease.runnerInstanceId === input.runnerInstanceId
      && lease.leaseId === input.leaseId
      && this.now().getTime() - lease.lastSeenAt < RUNNER_LEASE_TTL_MS;
  }

  assignAttempt(input: { leaseId: string; attemptId: string }): void {
    const lease = this.active;
    if (!lease || lease.leaseId !== input.leaseId || !this.isValid(lease)) throw new Error('runner_lease_invalid');
    lease.attempts.add(input.attemptId);
  }

  requireReady(): { runnerInstanceId: string; leaseId: string } {
    const lease = this.active;
    if (!lease || lease.status !== 'ready' || !this.isValid(lease)) throw new Error('runner_not_ready');
    return { runnerInstanceId: lease.runnerInstanceId, leaseId: lease.leaseId };
  }

  async poll(input: { runnerInstanceId: string; leaseId: string }): Promise<RunnerCommandBatch> {
    const lease = this.require(input);
    if (this.pending) throw new Error('runner_poll_conflict');
    this.touch(lease);
    const available = this.commands.take();
    if (available.commands.length) return available;
    return new Promise<RunnerCommandBatch>((resolve) => {
      const timeout = setTimeout(() => this.settlePending({ commands: [] }), RUNNER_EMPTY_POLL_MS);
      this.pending = { leaseId: lease.leaseId, resolve, timeout };
    });
  }

  async acceptEventBatch(
    input: RunnerEventBatch,
    apply: () => Promise<void>,
  ): Promise<RunnerEventAcknowledgement> {
    const batch = RunnerEventBatchSchema.parse(input);
    const lease = this.require({ runnerInstanceId: batch.runnerInstanceId, leaseId: batch.leaseId });
    const bodyHash = stableJson(batch.events);
    const replay = lease.eventAcks.get(batch.eventSeq);
    if (replay) {
      if (replay.bodyHash !== bodyHash) throw new Error('runner_event_replay_conflict');
      return replay.acknowledgement;
    }
    if (batch.eventSeq !== lease.nextEventSeq) throw new Error('runner_event_sequence_conflict');
    await apply();
    const acknowledgement: RunnerEventAcknowledgement = { eventSeq: batch.eventSeq, accepted: true };
    lease.eventAcks.set(batch.eventSeq, { bodyHash, acknowledgement });
    if (lease.eventAcks.size > 256) lease.eventAcks.delete(lease.eventAcks.keys().next().value as number);
    lease.nextEventSeq += 1;
    this.touch(lease);
    return acknowledgement;
  }

  dispose(): void {
    this.unsubscribe();
    if (this.active) clearTimeout(this.active.expiresTimer);
    if (this.pending) clearTimeout(this.pending.timeout);
    this.active = null;
    this.pending = null;
  }

  private require(input: { runnerInstanceId: string; leaseId: string }): ActiveLease {
    if (!this.isValid(input)) throw new Error('runner_lease_invalid');
    return this.active as ActiveLease;
  }

  private response(lease: ActiveLease): RunnerLeaseResponse {
    return {
      runnerInstanceId: lease.runnerInstanceId,
      leaseId: lease.leaseId,
      status: lease.status,
      leaseTtlMs: RUNNER_LEASE_TTL_MS,
      controlRevision: 'kiditem-runner-control-v1',
    };
  }

  private touch(lease: ActiveLease): void {
    lease.lastSeenAt = this.now().getTime();
    clearTimeout(lease.expiresTimer);
    lease.expiresTimer = setTimeout(() => this.expireCurrent(lease.runnerInstanceId), RUNNER_LEASE_TTL_MS);
  }

  private expireCurrent(runnerInstanceId: string): void {
    if (this.active?.runnerInstanceId === runnerInstanceId) this.invalidate(this.active);
  }

  private invalidate(lease: ActiveLease): void {
    clearTimeout(lease.expiresTimer);
    if (this.active?.leaseId === lease.leaseId) this.active = null;
    if (this.pending?.leaseId === lease.leaseId) this.settlePending({ commands: [] });
    this.revokeLease(lease.leaseId);
    for (const attemptId of lease.attempts) void this.interruptAttempt(attemptId).catch(() => undefined);
  }

  private resolvePendingFromQueue(): void {
    if (!this.pending || !this.active || this.pending.leaseId !== this.active.leaseId) return;
    const batch = this.commands.take();
    if (batch.commands.length) this.settlePending(batch);
  }

  private settlePending(batch: RunnerCommandBatch): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timeout);
    pending.resolve(batch);
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}
