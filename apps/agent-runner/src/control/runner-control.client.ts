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
    if (response.status === 204) return null;
    if (!response.ok) throw new RunnerControlHttpError(response.status);
    return RunnerCommandBatchSchema.parse(await response.json());
  }

  async postEvents(batch: RunnerEventBatch): Promise<{ eventSeq: number; accepted: true }> {
    return RunnerEventAcknowledgementSchema.parse(await this.post('/internal/agent-runtime/runner/events', batch, this.pollTimeoutMs));
  }

  /** Sends an outbox-owned serialized body unchanged, including on retry. */
  async postEventBody(body: string): Promise<{ eventSeq: number; accepted: true }> {
    const response = await this.rawPostBody('/internal/agent-runtime/runner/events', body, this.pollTimeoutMs);
    if (!response.ok) throw new RunnerControlHttpError(response.status);
    return RunnerEventAcknowledgementSchema.parse(await response.json());
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
    return this.request(new URL(path, this.origin), {
      method: 'POST',
      headers: { authorization: `Bearer ${this.options.token}`, 'content-type': 'application/json' },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  }
}

/** A single serial long-poll loop. Transient failures may reconnect only before the lease deadline. */
export class RunnerControlLoop {
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly options: Readonly<{ client: RunnerControlClient; now?: () => number; sleep?: (milliseconds: number) => Promise<void> }>) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async run(input: Readonly<{ runnerInstanceId: string; leaseId: string; onCommands: (commands: RunnerCommandBatch) => Promise<void>; stopAll: () => Promise<void> }>): Promise<never> {
    let deadline = this.now() + 30_000;
    for (;;) {
      try {
        const commands = await this.options.client.poll({ kind: 'poll', runnerInstanceId: input.runnerInstanceId, leaseId: input.leaseId });
        // A successful long-poll proves the current control lease is still live.
        deadline = this.now() + 30_000;
        if (commands) await input.onCommands(commands);
        continue; // 204 intentionally repolls immediately.
      } catch (error) {
        if (error instanceof RunnerControlHttpError && (error.status === 401 || error.status === 403 || error.status === 409)) {
          await input.stopAll(); throw new Error('runner_lease_lost');
        }
        if (this.now() >= deadline) { await input.stopAll(); throw new Error('runner_lease_lost'); }
        await this.sleep(100);
      }
    }
  }
}

function requiredOrigin(value: string): URL {
  const origin = new URL(value);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.port !== '4000' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('runner_control_origin_invalid');
  return origin;
}
