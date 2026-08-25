import {
  RunnerCommandBatchSchema,
  RunnerEventAcknowledgementSchema,
  RunnerLeaseResponseSchema,
  type RunnerEventBatch,
  type RunnerHello,
  type RunnerLeaseResponse,
  type RunnerPoll,
} from '@kiditem/shared/agent-runtime';

export class RunnerControlHttpError extends Error {
  constructor(readonly status: number) { super(`runner_control_http_${status}`); }
}

/** Outbound HTTP adapter; the native session owns retry and lease-loss state. */
export class RunnerControlClient {
  private readonly origin: URL;
  private readonly request: typeof fetch;
  private readonly pollTimeoutMs: number;
  private readonly inFlight = new Set<AbortController>();
  private readonly successfulPollListeners = new Set<() => void>();

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
    if (response.status === 204) { this.noteSuccessfulPollResponse(); return null; }
    if (!response.ok) throw new RunnerControlHttpError(response.status);
    const commands = RunnerCommandBatchSchema.parse(await response.json());
    this.noteSuccessfulPollResponse();
    return commands;
  }

  async postEvents(batch: RunnerEventBatch): Promise<{ eventSeq: number; accepted: true }> {
    const acknowledgement = RunnerEventAcknowledgementSchema.parse(await this.post('/internal/agent-runtime/runner/events', batch, this.pollTimeoutMs));
    return acknowledgement;
  }

  /** Sends an outbox-owned serialized body unchanged, including on retry. */
  async postEventBody(body: string): Promise<{ eventSeq: number; accepted: true }> {
    const response = await this.rawPostBody('/internal/agent-runtime/runner/events', body, this.pollTimeoutMs);
    if (!response.ok) throw new RunnerControlHttpError(response.status);
    const acknowledgement = RunnerEventAcknowledgementSchema.parse(await response.json());
    return acknowledgement;
  }

  /** Event delivery validates an existing lease; only command polling renews it. */
  onSuccessfulCommandPoll(listener: () => void): () => void {
    this.successfulPollListeners.add(listener);
    return () => this.successfulPollListeners.delete(listener);
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

  private noteSuccessfulPollResponse(): void {
    for (const listener of this.successfulPollListeners) listener();
  }
}

function requiredOrigin(value: string): URL {
  const origin = new URL(value);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.port !== '4000' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('runner_control_origin_invalid');
  return origin;
}
