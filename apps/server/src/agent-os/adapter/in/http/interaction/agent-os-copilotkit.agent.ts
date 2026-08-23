import { AbstractAgent, type RunAgentInput } from "@ag-ui/client";
import { EventType, type BaseEvent } from "@ag-ui/core";
import { defer, from, switchMap, type Observable } from "rxjs";
import { z } from "zod";
import { DashboardContextSchema } from "@kiditem/shared/agent-interaction";
import { AgentSessionNameSchema } from "@kiditem/shared/identifiers";
import type { AgentAguiRunnerPort } from "../../../../application/port/in/agent-agui-runner.port";
import type { AgentInteractionAuthorizationPort } from "../../../../application/port/in/interaction/agent-interaction-authorization.port";
import type { AgentAguiProducerPort } from "../../../../application/port/in/interaction/agent-agui-producer.port";
import type { AgentSessionApprovalDecisionPort } from "../../../../application/port/in/session-control/agent-session-approval-decision.port";
import { UserEventSchema } from "../../../../application/port/in/interaction/agent-interaction-input.contract";
import { AgentOsBoundaryError } from "../../../../domain/agent-os.errors";

const EMPTY_CONTEXT = { routeKey: "global", resourceRefs: [], filters: {}, visibleRowIds: [], aggregateSummary: {}, locale: "ko-KR", timezone: "Asia/Seoul" };

/** CopilotKit agent whose browser input is reduced to server-owned authorization props. */
export class AgentOsCopilotKitAgent extends AbstractAgent {
  constructor(
    private readonly principal: Readonly<{ organizationId: string; userId: string }>,
    private readonly agentDefinitionKey: string,
    private readonly authorization: AgentInteractionAuthorizationPort,
    private readonly runner: AgentAguiRunnerPort,
    private readonly approvals: AgentSessionApprovalDecisionPort,
    private readonly producers: AgentAguiProducerPort,
  ) {
    super({ agentId: agentDefinitionKey, description: `KidItem ${agentDefinitionKey}` });
    // CopilotKit stores the handler before invoking it, so it must retain this request scope.
    this.run = this.run.bind(this);
  }

  override run(input: RunAgentInput): Observable<BaseEvent> {
    return defer(async () => {
      if (input.resume?.length) return this.resumeApproval(input);
      const final = input.messages.at(-1);
      if (!final || final.role !== "user" || typeof final.content !== "string") {
        throw new Error("A final text user message is required.");
      }
      const dashboardContext = DashboardContextSchema.parse(
        isRecord(input.state) ? input.state.kiditemDashboardContext ?? EMPTY_CONTEXT : EMPTY_CONTEXT,
      );
      const userEvent = UserEventSchema.parse({
        externalEventId: final.id,
        schemaVersion: 1,
        payload: { phase: "complete", messageId: final.id, content: final.content },
      });
      const authorized = await this.authorization.authorizeRun({
        ...this.principal,
        agentDefinitionKey: this.agentDefinitionKey,
        copilotThreadId: input.threadId,
        aguiRunId: input.runId,
        dashboardContext,
        userEvent,
      });
      const authorizedInput = {
        agentDefinitionKey: this.agentDefinitionKey,
        input: { ...input, tools: [], forwardedProps: { kiditemAuthorization: authorized } },
      };
      // This key is derived exclusively from the authorization transaction.
      // It multiplexes only a currently-running durable execution; reconnects
      // remain database replay/live reads through AgentOsCopilotKitRunner.
      return this.producers.attach(
        `${authorized.execution}:${input.runId}`,
        () => this.runner.run(authorizedInput),
      );
    }).pipe(switchMap((events) => from(events))) as Observable<BaseEvent>;
  }

  private async resumeApproval(input: RunAgentInput): Promise<BaseEvent[]> {
    if (input.resume?.length !== 1) throw approvalResumeDenied();
    const [resume] = input.resume;
    const payload = approvalResumePayload.safeParse(resume.payload);
    if (!payload.success || resume.status !== "resolved" || resume.interruptId !== payload.data.approvalId) {
      throw approvalResumeDenied();
    }
    const session = AgentSessionNameSchema.safeParse(payload.data.session);
    if (!session.success) throw approvalResumeDenied();
    const connection = await this.authorization.authorizeConnection({
      ...this.principal,
      agentDefinitionKey: this.agentDefinitionKey,
      copilotThreadId: input.threadId,
      afterSequence: "0",
    });
    // CopilotKit reuses the connect request's transport run id for a standard
    // resume. It is not a durable execution authority. Revalidate the exact
    // authenticated thread/session instead; the approval service then binds
    // the actor and approval to that session transactionally.
    if (connection.authorization.session !== session.data) {
      throw approvalResumeDenied();
    }
    await this.approvals.decide({
      organizationId: this.principal.organizationId,
      actorId: this.principal.userId,
      session: session.data,
      approvalId: payload.data.approvalId,
      decision: payload.data.decision,
      idempotencyKey: payload.data.idempotencyKey,
    });
    return [
      { type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId },
      { type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId },
    ];
  }

  override clone(): AgentOsCopilotKitAgent {
    const clone = super.clone() as AgentOsCopilotKitAgent;
    Object.assign(clone, {
      principal: this.principal,
      agentDefinitionKey: this.agentDefinitionKey,
      authorization: this.authorization,
      runner: this.runner,
      approvals: this.approvals,
      producers: this.producers,
    });
    clone.run = clone.run.bind(clone);
    return clone;
  }
}

const approvalResumePayload = z.object({
  kind: z.literal("kiditem.agent_approval_decision.v1"),
  approvalId: z.string().uuid(),
  session: z.string().min(1).max(512),
  decision: z.enum(["approved", "rejected"]),
  idempotencyKey: z.string().uuid(),
}).strict();

function approvalResumeDenied(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    "INTERACTION_APPROVAL_RESUME_NOT_AUTHORIZED",
    "The approval resume request is not authorized.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
