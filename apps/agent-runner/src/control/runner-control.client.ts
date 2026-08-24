import {
  RunnerCommandBatchSchema,
  RunnerEventAcknowledgementSchema,
  RunnerLeaseResponseSchema,
  type RunnerCommandBatch,
  type RunnerEventBatch,
  type RunnerHello,
  type RunnerLeaseResponse,
  type RunnerPoll,
} from '@kiditem/shared/agent-runtime';

export class RunnerControlHttpError extends Error {
  constructor(readonly status: number) { super(`runner_control_http_${status}`); }
}

export class RunnerControlClient {
  private readonly origin: URL;
  private readonly request: typeof fetch;
  private readonly pollTimeoutMs: number;
  private readonly inFlight = new Set<AbortController>();
  private readonly successfulResponseListeners = new Set<() => void>();

  constructor(private readonly options: Readonly<{ controlOrigin: string; token: string; fetch?: typeof fetch; pollTimeoutMs?: number }>) {
    this.origin = requiredOrigin(options.controlOrigin);
    this.request = options.fetch ?? fetch;
    this.pollTimeoutMs = options.pollTimeoutMs ?? 25_000;
  }

  async hello(hello: RunnerHello): Promise<RunnerLeaseResponse> {
    return RunnerLeaseResponseSchema.parse(await this.post('/internal/agent-runtime/runner/commands:poll', hello, this.pollTimeoutMs));
  }

  async poll(poll: RunnerPoll): Promise<RunnerCommandBatch | null> {
    const response = await this.rawPost('/internal/agent-runtime/runner/commands:poll', poll, this.pollTimeoutMs);
    if (response.status === 204) { this.noteSuccessfulAuthenticatedResponse(); return null; }
    if (!response.ok) throw new RunnerControlHttpError(response.status);
    const commands = RunnerCommandBatchSchema.parse(await response.json());
    this.noteSuccessfulAuthenticatedResponse();
    return commands;
  }

  async postEvents(batch: RunnerEventBatch): Promise<{ eventSeq: number; accepted: true }> {
    const acknowledgement = RunnerEventAcknowledgementSchema.parse(await this.post('/internal/agent-runtime/runner/events', batch, this.pollTimeoutMs));
    this.noteSuccessfulAuthenticatedResponse();
    return acknowledgement;
  }

  /** Sends an outbox-owned serialized body unchanged, including on retry. */
  async postEventBody(body: string): Promise<{ eventSeq: number; accepted: true }> {
    const response = await this.rawPostBody('/internal/agent-runtime/runner/events', body, this.pollTimeoutMs);
    if (!response.ok) throw new RunnerControlHttpError(response.status);
    const acknowledgement = RunnerEventAcknowledgementSchema.parse(await response.json());
    this.noteSuccessfulAuthenticatedResponse();
    return acknowledgement;
  }

  /** Lets the lease owner reset its deadline only after a valid authenticated control response. */
  onSuccessfulAuthenticatedResponse(listener: () => void): () => void {
    this.successfulResponseListeners.add(listener);
    return () => this.successfulResponseListeners.delete(listener);
  }

  /** The lease deadline owns every control request, including an otherwise black-holed fetch. */
  abortInFlight(): void {
    for (const request of this.inFlight) request.abort(new Error('runner_control_deadline_exceeded'));
  }

  private async post(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
    const response = await this.rawPost(path, body, timeoutMs);
    if (!response.ok) throw new RunnerControlHttpError(response.status);
    return response.json();
  }

  private rawPost(path: string, body: unknown, timeoutMs: number): Promise<Response> {
    return this.rawPostBody(path, JSON.stringify(body), timeoutMs);
  }

  private rawPostBody(path: string, body: string, timeoutMs: number): Promise<Response> {
    const request = new AbortController();
    const timeout = setTimeout(() => request.abort(new Error('runner_control_request_timeout')), timeoutMs);
    this.inFlight.add(request);
    return this.request(new URL(path, this.origin), {
      method: 'POST',
      headers: { authorization: `Bearer ${this.options.token}`, 'content-type': 'application/json' },
      body,
      signal: request.signal,
    }).finally(() => {
      clearTimeout(timeout);
      this.inFlight.delete(request);
    });
  }

  private noteSuccessfulAuthenticatedResponse(): void {
    for (const listener of this.successfulResponseListeners) listener();
  }
}

/** A single serial long-poll loop. Transient failures may reconnect only before the lease deadline. */
export class RunnerControlLoop {
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly controlLossDeadlineMs: number;

  constructor(private readonly options: Readonly<{
    client: RunnerControlClient;
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
    controlLossDeadlineMs?: number;
  }>) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.controlLossDeadlineMs = options.controlLossDeadlineMs ?? 30_000;
  }

  async run(input: Readonly<{
    runnerInstanceId: string;
    leaseId: string;
    onCommands: (commands: RunnerCommandBatch) => Promise<void>;
    killAll: () => Promise<void>;
  }>): Promise<never> {
    const deadline = new RunnerControlLossDeadline({
      client: this.options.client,
      now: this.now,
      durationMs: this.controlLossDeadlineMs,
      killAll: input.killAll,
    });
    const unsubscribe = this.options.client.onSuccessfulAuthenticatedResponse(() => deadline.reset());
    deadline.start();
    try {
      for (;;) {
        try {
          const commands = await deadline.race(this.options.client.poll({ kind: 'poll', runnerInstanceId: input.runnerInstanceId, leaseId: input.leaseId }));
          if (commands) await deadline.race(input.onCommands(commands));
          continue; // 204 intentionally repolls immediately.
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
    }
  }
}

/** A wall-clock lease boundary which stays live while an individual fetch never settles. */
class RunnerControlLossDeadline {
  private readonly loss: Promise<never>;
  private rejectLoss!: (error: Error) => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lossStarted = false;
  private disposed = false;
  private deadline = 0;

  constructor(private readonly options: Readonly<{
    client: RunnerControlClient;
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

function requiredOrigin(value: string): URL {
  const origin = new URL(value);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.port !== '4000' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('runner_control_origin_invalid');
  return origin;
}
