import { HttpAgent, type RunAgentInput } from '@ag-ui/client';
import {
  DashboardContextSchema,
  type AguiRunAuthorization,
} from '@kiditem/shared/agent-interaction';
import {
  AgentSessionNameSchema,
  IdempotencyKeySchema,
  RequestIdSchema,
} from '@kiditem/shared/identifiers';
import { EventType, type BaseEvent } from '@ag-ui/core';
import { defer, of, switchMap, type Observable } from 'rxjs';
import { z } from 'zod';

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

const ApprovalResumePayloadSchema = z
  .object({
    kind: z.literal('kiditem.agent_approval_decision.v1'),
    approvalId: RequestIdSchema,
    session: AgentSessionNameSchema,
    decision: z.enum(['approved', 'rejected']),
    idempotencyKey: IdempotencyKeySchema,
  })
  .strict();

export interface AuthorizedAgentOptions {
  readonly request: Request;
  readonly control: NestControlPort;
  readonly agentDefinitionKey: string;
  readonly privateAguiUrl: string;
  readonly serviceSecret: string;
  readonly onAuthorized?: (
    authorization: AguiRunAuthorization,
    correlation: {
      readonly copilotThreadId: string;
      readonly aguiRunId: string;
    },
  ) => void;
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
    const approvalResume = parseApprovalResume(input);
    if (approvalResume) {
      return defer(async () => {
        await this.options.control.decideApproval(
          this.options.request,
          approvalResume,
        );
        return {
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
          outcome: { type: 'success' },
        } satisfies BaseEvent;
      }).pipe(
        switchMap((event) => of(event)),
      ) as unknown as ReturnType<HttpAgent['run']>;
    }
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
      this.options.onAuthorized?.(authorization, {
        copilotThreadId: input.threadId,
        aguiRunId: input.runId,
      });
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

function parseApprovalResume(
  input: RunAgentInput,
): z.infer<typeof ApprovalResumePayloadSchema> | null {
  if (!input.resume || input.resume.length === 0) return null;
  if (input.resume.length !== 1) {
    throw new Error('Exactly one durable approval decision is required.');
  }
  const entry = input.resume[0];
  if (!entry) {
    throw new Error('A durable approval decision entry is required.');
  }
  if (entry.status !== 'resolved') {
    throw new Error('Durable approval decisions must be resolved explicitly.');
  }
  const payload = ApprovalResumePayloadSchema.parse(entry.payload);
  if (payload.approvalId !== entry.interruptId) {
    throw new Error('Durable approval interrupt identity does not match.');
  }
  return payload;
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
    payload: {
      phase: 'complete',
      messageId: message.id,
      content: message.content,
    },
  };
}
