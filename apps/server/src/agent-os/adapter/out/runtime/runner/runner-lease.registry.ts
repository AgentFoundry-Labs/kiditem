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
import { RUNNER_COMMAND_QUEUE_MAX_ENTRIES, RunnerCommandQueue } from './runner-command.queue';

export const RUNNER_EMPTY_POLL_MS = 20_000;
export const RUNNER_LEASE_TTL_MS = 30_000;
// The command queue uses the same default bound for retained start metadata.
// Loss recovery must never turn rapid lease replacement into unbounded API
// memory even if a durable reconciliation is unavailable.
const MAX_LOSS_CLEANUP_ATTEMPTS = RUNNER_COMMAND_QUEUE_MAX_ENTRIES;

type ActiveLease = {
  runnerInstanceId: string;
  leaseId: string;
  generation: number;
  hello: RunnerHello;
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
  reconcileLeaseLoss?: (input: { leaseId: string; attemptIds: readonly string[] }) => Promise<void>;
  leaseId?: () => string;
  now?: () => Date;
}

/** One bounded control lease and at most one open long poll, held only in API memory. */
export class RunnerLeaseRegistry {
  private readonly commands: RunnerCommandQueue;
  private interruptAttempt: (attemptId: string) => Promise<void>;
  private revokeLease: (leaseId: string) => void;
  private reconcileLeaseLoss: ((input: { leaseId: string; attemptIds: readonly string[] }) => Promise<void>) | null;
  private readonly createLeaseId: () => string;
  private readonly now: () => Date;
  private readonly unsubscribe: () => void;
  private eventTail: Promise<void> = Promise.resolve();
  private nextLeaseGeneration = 0;
  private readonly pendingLossAttemptIds = new Set<string>();
  private pendingLossCleanupLeaseId: string | null = null;
  private lossCleanupInFlight = false;
  private lossCleanupFailed = false;
  private disposed = false;
  private active: ActiveLease | null = null;
  private pending: PendingPoll | null = null;

  constructor(options: RunnerLeaseRegistryOptions) {
    this.commands = options.commands;
    this.interruptAttempt = options.interruptAttempt;
    this.revokeLease = options.revokeLease ?? (() => undefined);
    this.reconcileLeaseLoss = options.reconcileLeaseLoss ?? null;
    this.createLeaseId = options.leaseId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
    this.unsubscribe = this.commands.subscribe(() => this.resolvePendingFromQueue());
  }

  hello(input: RunnerHello): RunnerLeaseResponse {
    this.assertNotDisposed();
    const hello = immutableHello(RunnerHelloSchema.parse(input));
    const helloHash = stableJson(hello);
    const active = this.active;
    if (active && active.runnerInstanceId === hello.runnerInstanceId) {
      if (active.helloHash !== helloHash) throw new Error('runner_hello_conflict');
      return this.response(active);
    }
    if (this.active) this.invalidate(this.active);
    const lease: ActiveLease = {
      runnerInstanceId: hello.runnerInstanceId,
      leaseId: this.createLeaseId(),
      generation: ++this.nextLeaseGeneration,
      hello,
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
    this.assertLossCleanupComplete();
    lease.status = 'ready';
    return this.response(lease);
  }

  /** A failed readiness canary immediately removes business admission. */
  markProbing(input: { runnerInstanceId: string; leaseId: string }): RunnerLeaseResponse {
    const lease = this.require(input);
    lease.status = 'probing';
    return this.response(lease);
  }

  /** Binds final lifecycle hooks without putting control state in a database. */
  setLossHandlers(input: {
    interruptAttempt: (attemptId: string) => Promise<void>;
    revokeLease: (leaseId: string) => void;
    reconcileLeaseLoss?: (input: { leaseId: string; attemptIds: readonly string[] }) => Promise<void>;
  }): void {
    this.interruptAttempt = input.interruptAttempt;
    this.revokeLease = input.revokeLease;
    this.reconcileLeaseLoss = input.reconcileLeaseLoss ?? null;
  }

  isValid(input: { runnerInstanceId: string; leaseId: string }): boolean {
    const lease = this.active;
    return !this.disposed
      && !!lease
      && lease.runnerInstanceId === input.runnerInstanceId
      && lease.leaseId === input.leaseId
      && this.now().getTime() - lease.lastSeenAt < RUNNER_LEASE_TTL_MS;
  }

  /** Returns the current strict hello lease without treating probing as business-ready. */
  requireActive(): { runnerInstanceId: string; leaseId: string; status: 'probing' | 'ready'; hello: RunnerHello } {
    const lease = this.active;
    if (!lease || !this.isValid(lease)) throw new Error('runner_not_ready');
    return {
      runnerInstanceId: lease.runnerInstanceId,
      leaseId: lease.leaseId,
      status: lease.status,
      hello: lease.hello,
    };
  }

  requireReady(): { runnerInstanceId: string; leaseId: string } {
    const lease = this.active;
    if (!lease || lease.status !== 'ready' || !this.isValid(lease)) throw new Error('runner_not_ready');
    this.assertLossCleanupComplete();
    return { runnerInstanceId: lease.runnerInstanceId, leaseId: lease.leaseId };
  }

  /** Local-only command generation; it is never included in the wire lease. */
  generationForLease(input: { runnerInstanceId: string; leaseId: string }): number {
    return this.require(input).generation;
  }

  async poll(input: { runnerInstanceId: string; leaseId: string }): Promise<RunnerCommandBatch> {
    const lease = this.require(input);
    if (this.pending) throw new Error('runner_poll_conflict');
    this.touch(lease);
    const available = this.takeForLease(lease);
    if (available.commands.length) return available;
    return new Promise<RunnerCommandBatch>((resolve) => {
      const timeout = setTimeout(() => this.settlePending({ commands: [] }), RUNNER_EMPTY_POLL_MS);
      this.pending = { leaseId: lease.leaseId, resolve, timeout };
    });
  }

  async acceptEventBatch(
    input: RunnerEventBatch,
    apply: (assertActive: () => void) => Promise<void>,
  ): Promise<RunnerEventAcknowledgement> {
    const batch = RunnerEventBatchSchema.parse(input);
    return this.serializeEvent(async () => {
      const lease = this.require({ runnerInstanceId: batch.runnerInstanceId, leaseId: batch.leaseId });
      const bodyHash = stableJson(batch.events);
      const replay = lease.eventAcks.get(batch.eventSeq);
      if (replay) {
        if (replay.bodyHash !== bodyHash) throw new Error('runner_event_replay_conflict');
        return replay.acknowledgement;
      }
      if (batch.eventSeq !== lease.nextEventSeq) throw new Error('runner_event_sequence_conflict');
      const assertActive = () => {
        this.assertActiveLease(lease, batch);
        this.assertEventOwnership(lease, batch);
      };
      assertActive();
      await apply(assertActive);
      this.assertActiveLease(lease, batch);
      for (const event of batch.events) {
        if (event.kind === 'attempt.terminal' || event.kind === 'attempt.rejected') {
          lease.attempts.delete(event.attemptId);
        }
      }
      const acknowledgement: RunnerEventAcknowledgement = { eventSeq: batch.eventSeq, accepted: true };
      lease.eventAcks.set(batch.eventSeq, { bodyHash, acknowledgement });
      if (lease.eventAcks.size > 256) lease.eventAcks.delete(lease.eventAcks.keys().next().value as number);
      lease.nextEventSeq += 1;
      return acknowledgement;
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    if (this.active) clearTimeout(this.active.expiresTimer);
    if (this.pending) clearTimeout(this.pending.timeout);
    this.active = null;
    this.pending = null;
    this.pendingLossAttemptIds.clear();
    this.pendingLossCleanupLeaseId = null;
    this.lossCleanupInFlight = false;
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
    // Fence queue records before a replacement can become ready. This removes
    // raw start tokens synchronously while durable reconciliation remains
    // asynchronous and idempotent.
    const attemptIds = this.commands.fenceLeaseGeneration(lease.generation);
    if (this.active?.leaseId === lease.leaseId) this.active = null;
    if (this.pending?.leaseId === lease.leaseId) this.settlePending({ commands: [] });
    this.revokeLease(lease.leaseId);
    this.beginLossCleanup({ leaseId: lease.leaseId, attemptIds });
  }

  private resolvePendingFromQueue(): void {
    if (!this.pending || !this.active || this.pending.leaseId !== this.active.leaseId) return;
    const batch = this.takeForLease(this.active);
    if (batch.commands.length) this.settlePending(batch);
  }

  private settlePending(batch: RunnerCommandBatch): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timeout);
    pending.resolve(batch);
  }

  private takeForLease(lease: ActiveLease): RunnerCommandBatch {
    const batch = this.commands.takeForLease({
      leaseKey: this.deliveryLeaseKey(lease),
      leaseGeneration: lease.generation,
      ...(lease.status !== 'ready' || this.lossCleanupPending()
        ? { allowedMcpToolScope: 'readiness_canary' as const }
        : {}),
    });
    for (const command of batch.commands) {
      if (command.kind === 'attempt.start') lease.attempts.add(command.attemptId);
    }
    return batch;
  }

  private deliveryLeaseKey(lease: ActiveLease): string {
    return `${lease.runnerInstanceId}\u0000${lease.leaseId}`;
  }

  /**
   * A global durable reconciliation has no local lease predicate. Coalesce
   * replacement storms into one bounded drain: a successor remains probing
   * until the active pass and any local IDs that arrived during it are safe.
   */
  private beginLossCleanup(input: { leaseId: string; attemptIds: readonly string[] }): void {
    if (this.disposed) return;
    const added = this.collectLostAttempts(input.attemptIds);
    if (this.lossCleanupInFlight) {
      // Empty-loss hello churn is already covered by the active global pass.
      // A newly fenced Attempt needs one subsequent snapshot after it settles.
      if (added) this.pendingLossCleanupLeaseId = input.leaseId;
      return;
    }
    this.pendingLossCleanupLeaseId = input.leaseId;
    this.lossCleanupInFlight = true;
    void this.drainLossCleanup();
  }

  private collectLostAttempts(attemptIds: readonly string[]): boolean {
    let added = false;
    for (const attemptId of attemptIds) {
      if (this.pendingLossAttemptIds.has(attemptId)) continue;
      if (this.pendingLossAttemptIds.size >= MAX_LOSS_CLEANUP_ATTEMPTS) {
        // Queue fencing/revocation already removed the raw token. A local
        // overflow cannot safely be represented, so durable admission remains
        // closed even if the global recovery pass later resolves.
        this.lossCleanupFailed = true;
        continue;
      }
      this.pendingLossAttemptIds.add(attemptId);
      added = true;
    }
    return added;
  }

  private async drainLossCleanup(): Promise<void> {
    try {
      while (!this.disposed) {
        const leaseId = this.pendingLossCleanupLeaseId;
        if (!leaseId) return;
        const attemptIds = [...this.pendingLossAttemptIds];
        this.pendingLossAttemptIds.clear();
        this.pendingLossCleanupLeaseId = null;
        await this.completeLossCleanup({ leaseId, attemptIds });
        // A replacement that loses no local Attempt cannot introduce new
        // business work while this barrier is closed, so it needs no replay.
        if (!this.pendingLossCleanupLeaseId) return;
      }
    } catch {
      if (!this.disposed) this.lossCleanupFailed = true;
    } finally {
      if (this.disposed) return;
      this.lossCleanupInFlight = false;
    }
  }

  private async completeLossCleanup(input: { leaseId: string; attemptIds: readonly string[] }): Promise<void> {
    if (this.reconcileLeaseLoss) {
      try {
        await this.reconcileLeaseLoss(input);
        return;
      } catch {
        if (this.disposed) return;
      }
    }
    try {
      await this.interruptLostAttempts(input.attemptIds);
    } catch {
      if (!this.disposed) this.lossCleanupFailed = true;
    }
  }

  private async interruptLostAttempts(attemptIds: readonly string[]): Promise<void> {
    const results = await Promise.allSettled(attemptIds.map((attemptId) => this.interruptAttempt(attemptId)));
    if (results.some((result) => result.status === 'rejected')) throw new Error('runner_loss_cleanup_failed');
  }

  private lossCleanupPending(): boolean {
    return this.lossCleanupInFlight || this.lossCleanupFailed;
  }

  private assertLossCleanupComplete(): void {
    if (this.lossCleanupPending()) throw new Error('runner_not_ready');
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('runner_registry_disposed');
  }

  private assertEventOwnership(lease: ActiveLease, batch: RunnerEventBatch): void {
    for (const event of batch.events) {
      if (!lease.attempts.has(event.attemptId)) throw new Error('runner_event_attempt_unassigned');
      if (event.kind === 'command_ack' || event.kind === 'attempt.rejected') {
        if (this.commands.commandAttempt(event.commandId) !== event.attemptId) {
          throw new Error('runner_event_command_unassigned');
        }
      }
    }
  }

  private assertActiveLease(lease: ActiveLease, batch: RunnerEventBatch): void {
    const current = this.require({ runnerInstanceId: batch.runnerInstanceId, leaseId: batch.leaseId });
    if (current !== lease) throw new Error('runner_lease_invalid');
  }

  private serializeEvent<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.eventTail.then(operation, operation);
    this.eventTail = result.then(() => undefined, () => undefined);
    return result;
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function immutableHello(hello: RunnerHello): RunnerHello {
  return Object.freeze({
    ...hello,
    runtimes: Object.freeze({
      codex_cli: Object.freeze({ ...hello.runtimes.codex_cli }),
      claude_cli: Object.freeze({ ...hello.runtimes.claude_cli }),
    }),
  });
}
