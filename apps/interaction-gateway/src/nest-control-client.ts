import {
  AguiConnectionAuthorizationSchema,
  AguiRunAuthorizationSchema,
  AguiRunIntentSchema,
  InteractionBootstrapSchema,
  type AguiConnectionAuthorization,
  type AguiRunAuthorization,
  type AguiRunIntent,
  type DashboardContext,
  type InteractionBootstrap,
} from '@kiditem/shared/agent-interaction';
import { BaseEventSchema, type BaseEvent } from '@ag-ui/core';
import { Observable } from 'rxjs';
import { z } from 'zod';

const HealthSchema = z.object({ status: z.literal('ok') }).strict();
const ErrorCodeSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/);

export interface SubmittedUserEvent {
  readonly externalEventId: string;
  readonly schemaVersion: 1;
  readonly payload: {
    readonly messageId: string;
    readonly content: string;
  };
}

export interface PrepareRunIntentInput {
  readonly agentDefinitionKey: string;
  readonly copilotThreadId: string;
  readonly aguiRunId: string;
  readonly dashboardContext: DashboardContext;
  readonly userEvent: SubmittedUserEvent;
}

export interface AuthorizeRunInput extends Omit<
  PrepareRunIntentInput,
  'agentDefinitionKey'
> {
  readonly runIntent: string;
}

export interface ConnectLiveInput {
  readonly agentDefinitionKey: string;
  readonly copilotThreadId: string;
  readonly afterSequence: string;
  readonly liveJoinToken: string;
}

export interface StopRunInput {
  readonly agentDefinitionKey: string;
  readonly copilotThreadId: string;
  readonly aguiRunId: string;
  readonly sessionId: string;
  readonly executionId: string;
}

export interface NestControlPort {
  bootstrap(request: Request): Promise<InteractionBootstrap>;
  prepareRunIntent(
    request: Request,
    input: PrepareRunIntentInput,
  ): Promise<AguiRunIntent>;
  authorizeRun(input: AuthorizeRunInput): Promise<AguiRunAuthorization>;
  authorizeConnection(
    request: Request,
    input: {
      readonly copilotThreadId: string;
      readonly cursor?: string | null;
    },
  ): Promise<AguiConnectionAuthorization>;
  connectLive(request: Request, input: ConnectLiveInput): Observable<BaseEvent>;
  stopRun(request: Request, input: StopRunInput): Promise<boolean>;
  checkInteractionHealth(): Promise<void>;
  checkPrivateAguiHealth(): Promise<void>;
}

export class GatewayControlError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`KidItem control request failed (${status}, ${code})`);
    this.name = 'GatewayControlError';
  }
}

export interface NestControlClientOptions {
  readonly kidItemApiInternalUrl: string;
  readonly privateAguiUrl: string;
  readonly serviceSecret: string;
  readonly fetch?: typeof globalThis.fetch;
}

export class NestControlClient implements NestControlPort {
  private readonly fetch: typeof globalThis.fetch;

  constructor(private readonly options: NestControlClientOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  bootstrap(request: Request): Promise<InteractionBootstrap> {
    return this.request(
      '/api/agent-os/interaction/bootstrap',
      { method: 'GET', headers: this.browserHeaders(request) },
      InteractionBootstrapSchema,
    );
  }

  prepareRunIntent(
    request: Request,
    input: PrepareRunIntentInput,
  ): Promise<AguiRunIntent> {
    return this.request(
      '/api/agent-os/interaction/runs/intent',
      this.jsonRequest(input, this.browserHeaders(request)),
      AguiRunIntentSchema,
    );
  }

  authorizeRun(input: AuthorizeRunInput): Promise<AguiRunAuthorization> {
    return this.request(
      '/api/agent-os/interaction/runs/authorize',
      this.jsonRequest(input, this.serviceHeaders()),
      AguiRunAuthorizationSchema,
    );
  }

  authorizeConnection(
    request: Request,
    input: {
      readonly copilotThreadId: string;
      readonly cursor?: string | null;
    },
  ): Promise<AguiConnectionAuthorization> {
    return this.request(
      '/api/agent-os/interaction/connections/authorize',
      this.jsonRequest(input, {
        ...this.browserHeaders(request),
        ...this.serviceHeaders(),
      }),
      AguiConnectionAuthorizationSchema,
    );
  }

  connectLive(
    _request: Request,
    input: ConnectLiveInput,
  ): Observable<BaseEvent> {
    return this.sseRequest(
      `${this.agentUrl(input.agentDefinitionKey)}/connect`,
      this.jsonRequest(
        {
          copilotThreadId: input.copilotThreadId,
          afterSequence: input.afterSequence,
          liveJoinToken: input.liveJoinToken,
        },
        this.serviceHeaders(),
      ),
    );
  }

  async stopRun(_request: Request, input: StopRunInput): Promise<boolean> {
    const result = await this.requestAbsolute(
      `${this.agentUrl(input.agentDefinitionKey)}/stop`,
      this.jsonRequest(
        {
          copilotThreadId: input.copilotThreadId,
          aguiRunId: input.aguiRunId,
          sessionId: input.sessionId,
          executionId: input.executionId,
        },
        this.serviceHeaders(),
      ),
      z.object({ stopped: z.boolean() }).strict(),
    );
    return result.stopped;
  }

  async checkInteractionHealth(): Promise<void> {
    await this.request(
      '/api/agent-os/interaction/health',
      { method: 'GET', headers: this.serviceHeaders() },
      HealthSchema,
    );
  }

  async checkPrivateAguiHealth(): Promise<void> {
    await this.requestAbsolute(
      `${this.options.privateAguiUrl.replace(/\/$/, '')}/health`,
      { method: 'GET', headers: this.serviceHeaders() },
      HealthSchema,
    );
  }

  private browserHeaders(request: Request): Record<string, string> {
    const cookie = request.headers.get('cookie');
    return cookie ? { cookie } : {};
  }

  private serviceHeaders(): Record<string, string> {
    return {
      'x-kiditem-interaction-gateway': this.options.serviceSecret,
    };
  }

  private jsonRequest(
    body: unknown,
    headers: Record<string, string>,
  ): RequestInit {
    return {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    };
  }

  private agentUrl(agentDefinitionKey: string): string {
    return `${this.options.privateAguiUrl.replace(/\/$/, '')}/${encodeURIComponent(agentDefinitionKey)}`;
  }

  private request<T>(
    path: string,
    init: RequestInit,
    schema: { parse(value: unknown): T },
  ): Promise<T> {
    return this.requestAbsolute(
      new URL(path, this.options.kidItemApiInternalUrl).toString(),
      init,
      schema,
    );
  }

  private async requestAbsolute<T>(
    url: string,
    init: RequestInit,
    schema: { parse(value: unknown): T },
  ): Promise<T> {
    const response = await this.fetch(url, init);
    if (!response.ok) throw await this.controlError(response);
    return schema.parse(await response.json());
  }

  private sseRequest(url: string, init: RequestInit): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const abortController = new AbortController();
      void (async () => {
        const response = await this.fetch(url, {
          ...init,
          signal: abortController.signal,
        });
        if (!response.ok) throw await this.controlError(response);
        if (!response.body) {
          throw new GatewayControlError(502, 'private_stream_missing');
        }

        const reader = response.body
          .pipeThrough(new TextDecoderStream())
          .getReader();
        let pending = '';
        while (true) {
          const { done, value } = await reader.read();
          pending += value ?? '';
          const frames = pending.split(/\r?\n\r?\n/);
          pending = frames.pop() ?? '';
          for (const frame of frames) {
            for (const line of frame.split(/\r?\n/)) {
              if (!line.startsWith('data:')) continue;
              subscriber.next(
                BaseEventSchema.parse(JSON.parse(line.slice(5).trim())),
              );
            }
          }
          if (done) break;
        }
        subscriber.complete();
      })().catch((error: unknown) => {
        if (!abortController.signal.aborted) subscriber.error(error);
      });
      return () => abortController.abort();
    });
  }

  private async controlError(response: Response): Promise<GatewayControlError> {
    let code = `http_${response.status}`;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === 'object' && 'code' in body) {
        const parsed = ErrorCodeSchema.safeParse(
          (body as { readonly code?: unknown }).code,
        );
        if (parsed.success) code = parsed.data;
      }
    } catch {
      // The response body is deliberately not reflected into the error.
    }
    return new GatewayControlError(response.status, code);
  }
}
