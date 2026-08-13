import { HttpAgent, type RunAgentInput } from '@ag-ui/client';
import {
  DashboardContextSchema,
  type AguiRunAuthorization,
} from '@kiditem/shared/agent-interaction';
import { defer, switchMap, type Observable } from 'rxjs';
import type { BaseEvent } from '@ag-ui/core';

import type {
  NestControlPort,
  SubmittedUserEvent,
} from './nest-control-client.js';

const EMPTY_DASHBOARD_CONTEXT = Object.freeze({
  routeKey: 'global',
  resourceRefs: [],
  filters: {},
  visibleRowIds: [],
  aggregateSummary: {},
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
});

export interface AuthorizedAgentOptions {
  readonly request: Request;
  readonly control: NestControlPort;
  readonly agentDefinitionKey: string;
  readonly privateAguiUrl: string;
  readonly serviceSecret: string;
  readonly onAuthorized?: (authorization: AguiRunAuthorization) => void;
}

export class AuthorizedAgentOsHttpAgent extends HttpAgent {
  constructor(private readonly options: AuthorizedAgentOptions) {
    super({
      agentId: options.agentDefinitionKey,
      description: `KidItem ${options.agentDefinitionKey}`,
      url: `${options.privateAguiUrl.replace(/\/$/, '')}/${encodeURIComponent(options.agentDefinitionKey)}`,
      headers: serviceHeaders(options.serviceSecret),
    });
  }

  override run(input: RunAgentInput): ReturnType<HttpAgent['run']> {
    const dashboardContext = DashboardContextSchema.parse(
      readDashboardContext(input.state),
    );
    const userEvent = normalizeSubmittedUserEvent(input);

    const authorizedStream = defer(async () => {
      const prepared = await this.options.control.prepareRunIntent(
        this.options.request,
        {
          agentDefinitionKey: this.options.agentDefinitionKey,
          copilotThreadId: input.threadId,
          aguiRunId: input.runId,
          dashboardContext,
          userEvent,
        },
      );
      const authorization = await this.options.control.authorizeRun({
        runIntent: prepared.runIntent,
        copilotThreadId: input.threadId,
        aguiRunId: input.runId,
        dashboardContext,
        userEvent,
      });
      this.options.onAuthorized?.(authorization);
      return authorization;
    }).pipe(
      switchMap((authorization) => {
        // CopilotKit may have merged browser headers onto the request clone.
        // Rebuild the private boundary from server-owned values only.
        this.headers = serviceHeaders(this.options.serviceSecret);
        return super.run({
          ...input,
          forwardedProps: { kiditemAuthorization: authorization },
        }) as unknown as Observable<BaseEvent>;
      }),
    );
    return authorizedStream as unknown as ReturnType<HttpAgent['run']>;
  }

  override clone(): AuthorizedAgentOsHttpAgent {
    return new AuthorizedAgentOsHttpAgent(this.options);
  }
}

function serviceHeaders(secret: string): Record<string, string> {
  return { 'x-kiditem-interaction-gateway': secret };
}

function readDashboardContext(state: unknown): unknown {
  if (!state || typeof state !== 'object') return EMPTY_DASHBOARD_CONTEXT;
  const candidate = (state as Record<string, unknown>).kiditemDashboardContext;
  return candidate ?? EMPTY_DASHBOARD_CONTEXT;
}

function normalizeSubmittedUserEvent(input: RunAgentInput): SubmittedUserEvent {
  const message = input.messages.at(-1);
  if (
    !message ||
    message.role !== 'user' ||
    typeof message.content !== 'string'
  ) {
    throw new Error('A single final text user message is required.');
  }
  if (message.content.length < 1 || message.content.length > 100_000) {
    throw new Error(
      'The submitted user message is outside the supported bound.',
    );
  }
  return {
    externalEventId: message.id,
    schemaVersion: 1,
    payload: { messageId: message.id, content: message.content },
  };
}
