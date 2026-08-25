import {
  GATEWAY_CONTROL_CLIENT_POLL_TIMEOUT_MS,
  GATEWAY_CONTROL_EVENT_TIMEOUT_MS,
  GatewayCommandBatchSchema,
  GatewayEventAcknowledgementSchema,
  GatewayPollSchema,
  type GatewayCommandBatch,
  type GatewayPoll,
} from '@kiditem/shared/agent-runtime';

export class GatewayControlHttpError extends Error {
  constructor(readonly status: number) { super(`gateway_control_http_${status}`); }
}

const MAX_CONTROL_RESPONSE_BYTES = 64 * 1024;

/** Outbound loopback transport. The native session owns retries and loss. */
export class GatewayControlClient {
  private readonly origin: URL;
  private readonly request: typeof fetch;
  private readonly pollTimeoutMs: number;
  private readonly eventTimeoutMs: number;
  private readonly inFlight = new Set<AbortController>();

  constructor(private readonly options: Readonly<{ controlOrigin: string; token: string; fetch?: typeof fetch; pollTimeoutMs?: number }>) {
    this.origin = requiredOrigin(options.controlOrigin);
    this.request = options.fetch ?? fetch;
    this.pollTimeoutMs = options.pollTimeoutMs ?? GATEWAY_CONTROL_CLIENT_POLL_TIMEOUT_MS;
    this.eventTimeoutMs = GATEWAY_CONTROL_EVENT_TIMEOUT_MS;
  }

  async poll(input: GatewayPoll): Promise<GatewayCommandBatch | null> {
    const poll = GatewayPollSchema.parse(input);
    const response = await this.rawPost('/internal/agent-runtime/gateway/commands:poll', JSON.stringify(poll), this.pollTimeoutMs);
    if (response.status === 204) return null;
    if (!response.ok) throw new GatewayControlHttpError(response.status);
    return GatewayCommandBatchSchema.parse(await boundedJson(response));
  }

  async postEventBody(body: string): Promise<{ eventSeq: number; accepted: true }> {
    const response = await this.rawPost('/internal/agent-runtime/gateway/events', body, this.eventTimeoutMs);
    if (!response.ok) throw new GatewayControlHttpError(response.status);
    return GatewayEventAcknowledgementSchema.parse(await boundedJson(response));
  }

  abortInFlight(): void {
    for (const controller of this.inFlight) controller.abort(new Error('gateway_control_request_timeout'));
  }

  private rawPost(path: string, body: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('gateway_control_request_timeout')), timeoutMs);
    this.inFlight.add(controller);
    return this.request(new URL(path, this.origin), {
      method: 'POST',
      headers: { authorization: `Bearer ${this.options.token}`, 'content-type': 'application/json' },
      body,
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timer);
      this.inFlight.delete(controller);
    });
  }
}

function requiredOrigin(value: string): URL {
  const origin = new URL(value);
  if (
    origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.port !== '4000' ||
    origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password
  ) throw new Error('gateway_control_origin_invalid');
  return origin;
}

/** Reads loopback response data with a hard byte ceiling before parsing JSON. */
async function boundedJson(response: Response): Promise<unknown> {
  const body = response.body;
  if (!body) return parseBoundedText(await response.text());
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_CONTROL_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('gateway_control_response_too_large');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return parseBoundedText(new TextDecoder().decode(result));
}

function parseBoundedText(value: string): unknown {
  if (Buffer.byteLength(value, 'utf8') > MAX_CONTROL_RESPONSE_BYTES) throw new Error('gateway_control_response_too_large');
  try { return JSON.parse(value); } catch { throw new Error('gateway_control_response_invalid'); }
}
