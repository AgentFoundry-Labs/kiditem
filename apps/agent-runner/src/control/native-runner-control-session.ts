import type { RunnerCommandBatch, RunnerEvent, RunnerPoll } from '@kiditem/shared/agent-runtime';
import { type AttemptExecutorPort, RunnerCommandDispatcher } from './runner-command-dispatcher';
import { RunnerControlHttpError } from './runner-control.client';
import { RunnerEventOutbox } from './runner-event-outbox';

type NativeAttemptExecutionPort = AttemptExecutorPort & { shutdown(): Promise<void> };

/** Outbound HTTP contract consumed exclusively by this native control Module. */
export interface RunnerControlTransport {
  poll(poll: RunnerPoll): Promise<RunnerCommandBatch | null>;
  postEventBody(body: string): Promise<{ eventSeq: number; accepted: true }>;
  onSuccessfulCommandPoll(listener: () => void): () => void;
  abortInFlight(): void;
}

/**
 * One native Runner Module owns the serial poll/dispatch/outbox/loss loop.
 * Provider process execution remains an injected adapter, never control state.
 */
export interface NativeRunnerControlSessionPort {
  emit(event: RunnerEvent): void;
  run(): Promise<never>;
  shutdown(): Promise<void>;
}

export class NativeRunnerControlSession implements NativeRunnerControlSessionPort {
  private readonly outbox: RunnerEventOutbox;
  private readonly dispatcher: RunnerCommandDispatcher;
  private readonly flushIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly controlLossDeadlineMs: number;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private runTask: Promise<never> | null = null;
  private shutdownTask: Promise<void> | null = null;

  constructor(private readonly options: Readonly<{
    client: RunnerControlTransport;
    runnerInstanceId: string;
    leaseId: string;
    executor: NativeAttemptExecutionPort;
    flushIntervalMs?: number;
    controlLossDeadlineMs?: number;
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
  }>) {
    this.flushIntervalMs = options.flushIntervalMs ?? 250;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.controlLossDeadlineMs = options.controlLossDeadlineMs ?? 30_000;
    this.outbox = new RunnerEventOutbox({
      runnerInstanceId: options.runnerInstanceId,
      leaseId: options.leaseId,
    });
    this.dispatcher = new RunnerCommandDispatcher({ executor: options.executor, outbox: this.outbox });
  }

  emit(event: RunnerEvent): void {
    if (event.kind === 'attempt.terminal') this.dispatcher.markTerminal(event.attemptId);
    this.outbox.enqueue(event);
  }

  run(): Promise<never> {
    if (!this.runTask) this.runTask = this.runControlLoop();
    return this.runTask;
  }

  shutdown(): Promise<void> {
    if (this.shutdownTask) return this.shutdownTask;
    this.shutdownTask = (async () => {
      this.stopFlushTimer();
      const results = await Promise.allSettled([this.dispatcher.shutdown(), this.options.executor.shutdown()]);
      const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
      if (errors.length) throw new AggregateError(errors, 'runner_shutdown_kill_all_failed');
    })();
    return this.shutdownTask;
  }

  private async runControlLoop(): Promise<never> {
    this.startFlushTimer();
    const deadline = new NativeRunnerControlLossDeadline({
      client: this.options.client,
      now: this.now,
      durationMs: this.controlLossDeadlineMs,
      killAll: () => this.shutdown(),
    });
    const unsubscribe = this.options.client.onSuccessfulCommandPoll(() => deadline.reset());
    deadline.start();
    try {
      for (;;) {
        try {
          const commands = await deadline.race(this.options.client.poll({
            kind: 'poll',
            runnerInstanceId: this.options.runnerInstanceId,
            leaseId: this.options.leaseId,
          }));
          if (commands) await deadline.race(this.dispatch(commands));
          continue; // An empty successful poll intentionally renews and repolls immediately.
        } catch (error) {
          if (deadline.expired) return await deadline.waitForLoss();
          if (error instanceof RunnerControlHttpError && (error.status === 401 || error.status === 403 || error.status === 409)) {
            return await deadline.failClosed();
          }
          await deadline.race(this.sleep(100));
        }
      }
    } finally {
      unsubscribe();
      deadline.dispose();
      this.stopFlushTimer();
    }
  }

  private async dispatch(batch: RunnerCommandBatch): Promise<void> {
    for (const command of batch.commands) await this.dispatcher.dispatch(command);
    await this.flush();
  }

  private flush(): Promise<void> {
    return this.outbox.flush((body) => this.options.client.postEventBody(body));
  }

  private startFlushTimer(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => { void this.flush().catch(() => undefined); }, this.flushIntervalMs);
  }

  private stopFlushTimer(): void {
    if (!this.flushTimer) return;
    clearInterval(this.flushTimer);
    this.flushTimer = null;
  }
}

/** Wall-clock control-loss state is private to the native session Module. */
class NativeRunnerControlLossDeadline {
  private readonly loss: Promise<never>;
  private rejectLoss!: (error: Error) => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lossStarted = false;
  private disposed = false;
  private deadline = 0;

  constructor(private readonly options: Readonly<{
    client: RunnerControlTransport;
    now: () => number;
    durationMs: number;
    killAll: () => Promise<void>;
  }>) {
    if (!Number.isFinite(options.durationMs) || options.durationMs <= 0) throw new Error('runner_control_deadline_invalid');
    this.loss = new Promise<never>((_resolve, reject) => { this.rejectLoss = reject; });
  }

  get expired(): boolean { return this.lossStarted; }

  start(): void { this.reset(); }

  reset(): void {
    if (this.disposed || this.lossStarted) return;
    this.deadline = this.options.now() + this.options.durationMs;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.failClosed().catch(() => undefined); }, Math.max(0, this.deadline - this.options.now()));
  }

  race<T>(work: Promise<T>): Promise<T> { return Promise.race([work, this.loss]); }

  async failClosed(): Promise<never> {
    if (!this.lossStarted) {
      this.lossStarted = true;
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      this.options.client.abortInFlight();
      let cleanup: Promise<void>;
      try { cleanup = Promise.resolve(this.options.killAll()); }
      catch (error) { cleanup = Promise.reject(error); }
      void cleanup.then(
        () => this.rejectLoss(new Error('runner_lease_lost')),
        (error) => this.rejectLoss(new AggregateError([error], 'runner_control_kill_all_failed')),
      );
    }
    return this.loss;
  }

  waitForLoss(): Promise<never> { return this.loss; }

  dispose(): void {
    this.disposed = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }
}
