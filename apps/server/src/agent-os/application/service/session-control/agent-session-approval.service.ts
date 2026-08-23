import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  AgentApprovalCardSchema,
  CanonicalResourceRefSchema,
  type CanonicalResourceRef,
} from '@kiditem/shared/agent-interaction';
import {
  AgentExecutionAttemptIdSchema,
  AgentSessionIdSchema,
  RequestIdSchema,
  parseAgentExecutionAttemptName,
  parseAgentExecutionName,
  parseAgentSessionName,
  parseAgentSessionTaskName,
  type AgentExecutionAttemptName,
  type AgentExecutionName,
  type AgentSessionName,
  type AgentSessionTaskName,
} from '@kiditem/shared/identifiers';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../../operations/application/port/in/operation-runner.port';
import {
  AGENT_SESSION_RESOURCE_VERSION_VALIDATOR,
  type AgentSessionResourceVersionValidatorPort,
} from '../../port/out/resource/agent-session-resource-version-validator.port';
import {
  AGENT_SESSION_CONTROL_QUERY_REPOSITORY,
  type AgentSessionControlQueryRepositoryPort,
} from '../../port/out/repository/session-control/agent-session-control-query.repository.port';
import {
  AGENT_APPROVAL_CONTINUATION_TRANSACTION,
  type AgentApprovalContinuationTransactionPort,
} from '../../port/out/transaction/session-control/agent-approval-continuation.transaction.port';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import {
  assertApprovalDecision,
  isApprovalExpired,
} from '../../../domain/approval/agent-approval.policy';
import {
  AgentSessionRuntimeControlService,
  type PersistedAgentSessionRuntimeEvent,
} from './agent-session-runtime-control.service';
import { AgentSessionOperationContinuationService } from './agent-session-operation-continuation.service';
import {
  INTERACTION_CLOCK,
  type InteractionClock,
} from '../../port/in/interaction/interaction-clock.port';
interface RequestInput {
  organizationId: string;
  session: AgentSessionName;
  task: AgentSessionTaskName;
  execution: AgentExecutionName;
  attempt: AgentExecutionAttemptName;
  operationRunId: string;
  capabilityKey: string;
  arguments: Record<string, unknown>;
  summary: string;
  resourceVersions: CanonicalResourceRef[];
  expiresAt: string;
  idempotencyKey: string;
}

interface DecideInput {
  organizationId: string;
  session: AgentSessionName;
  approvalId: string;
  actorId: string;
  decision: 'approved' | 'rejected';
  argumentsHash?: string;
  idempotencyKey: string;
}

@Injectable()
export class AgentSessionApprovalService {
  constructor(
    @Inject(AGENT_SESSION_CONTROL_QUERY_REPOSITORY)
    private readonly queries: AgentSessionControlQueryRepositoryPort,
    @Inject(AGENT_APPROVAL_CONTINUATION_TRANSACTION)
    private readonly approvals: AgentApprovalContinuationTransactionPort,
    private readonly runtimeControl: AgentSessionRuntimeControlService,
    @Inject(AGENT_SESSION_RESOURCE_VERSION_VALIDATOR)
    private readonly resources: AgentSessionResourceVersionValidatorPort,
    @Inject(OPERATION_RUNNER_PORT)
    private readonly operations: OperationRunnerPort,
    private readonly continuations: AgentSessionOperationContinuationService,
    @Inject(INTERACTION_CLOCK)
    private readonly now: InteractionClock,
  ) {}

  async request(input: RequestInput): Promise<{
    approvalId: string;
    argumentsHash: string;
    persistedEvents: readonly PersistedAgentSessionRuntimeEvent[];
  }> {
    const graph = parseRequestGraph(input);
    const capabilityKey = boundedCapabilityKey(input.capabilityKey);
    const capabilityAllowed = await this.queries.isExecutionCapabilityAllowed({
      organizationId: graph.organizationId,
      sessionId: graph.sessionId,
      sessionTaskId: graph.taskId,
      executionId: graph.executionId,
      capabilityKey,
    });
    if (!capabilityAllowed) throw invalid('APPROVAL_CAPABILITY_FORBIDDEN');
    const expiresAt = new Date(input.expiresAt);
    const resources = CanonicalResourceRefSchema.array().max(50).parse(input.resourceVersions);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= this.now()) {
      throw invalid('APPROVAL_EXPIRED');
    }
    const argumentsHash = sha256(input.arguments);
    const approval = await this.approvals.requestApproval({
      organizationId: graph.organizationId,
      sessionId: graph.sessionId,
      taskId: graph.taskId,
      executionId: graph.executionId,
      attemptId: graph.attemptId,
      operationRunId: input.operationRunId,
      capabilityKey,
      argumentsHash,
      resourceSnapshot: resources,
      expiresAt,
      idempotencyKey: boundedKey(input.idempotencyKey),
    });
    if (approval.state !== 'pending') throw invalid('APPROVAL_STATE_INVALID');

    const approvalCard = AgentApprovalCardSchema.parse({
      name: 'kiditem.ui.agent_approval.v1',
      approvalId: approval.id,
      session: input.session,
      task: input.task,
      execution: input.execution,
      capabilityKey,
      summary: boundedSummary(input.summary),
      resourceVersions: resources.map((ref) => ({
        resourceType: ref.kind,
        resourceId: ref.id,
        version: ref.version ?? 'unversioned',
      })),
      expiresAt: expiresAt.toISOString(),
    });
    const card = await this.runtimeControl.persist({
      organizationId: graph.organizationId,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      externalEventId: `${graph.attemptId}:approval:${approval.id}:card`,
      eventType: 'state_snapshot',
      schemaVersion: 1,
      payload: {
        snapshotType: 'agent_approval',
        snapshotVersion: 1,
        data: approvalCard,
      },
    });
    const interrupt = await this.runtimeControl.persist({
      organizationId: graph.organizationId,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      externalEventId: `${graph.attemptId}:approval:${approval.id}:interrupt`,
      eventType: 'hitl_request',
      schemaVersion: 1,
      payload: {
        requestId: RequestIdSchema.parse(approval.id),
        status: 'pending',
        prompt: approvalCard.summary,
        approval: approvalCard,
      },
    });
    return { approvalId: approval.id, argumentsHash, persistedEvents: [card, interrupt] };
  }

  async decide(input: DecideInput): Promise<{ state: string }> {
    const session = parseDecisionSession(input);
    const idempotencyKey = boundedKey(input.idempotencyKey);
    const approval = await this.approvals.loadApproval({
      organizationId: session.organization,
      sessionId: session.session,
      approvalId: input.approvalId,
    });
    const replayingDecision = approval?.state === input.decision &&
      approval.decisionIdempotencyKey === idempotencyKey;
    if (
      !approval ||
      approval.organizationId !== session.organization ||
      approval.sessionId !== session.session ||
      (approval.state !== 'pending' && !replayingDecision) ||
      approval.requestedByUserId !== input.actorId
    ) throw invalid('APPROVAL_CONTEXT_CHANGED');
    if (input.argumentsHash !== undefined && approval.argumentsHash !== input.argumentsHash) {
      throw invalid('APPROVAL_CONTEXT_CHANGED');
    }
    if (!replayingDecision && isApprovalExpired(approval.expiresAt, this.now())) {
      await this.approvals.expireApproval({
        organizationId: session.organization,
        sessionId: session.session,
        approvalId: approval.id,
        expectedState: 'pending',
      });
      if (!approval.operationRunId) throw invalid('APPROVAL_OPERATION_MISSING');
      await this.operations.cancel({
        organizationId: session.organization,
        runId: approval.operationRunId,
        requestedByUserId: input.actorId,
        reason: 'approval_expired',
      });
      throw invalid('APPROVAL_EXPIRED');
    }
    if (input.decision === 'approved') {
      this.continuations.assertAccepting();
      const capabilityAllowed = await this.queries.isExecutionCapabilityAllowed({
        organizationId: session.organization,
        sessionId: session.session,
        sessionTaskId: approval.taskId,
        executionId: approval.executionId,
        capabilityKey: approval.capabilityKey,
      });
      if (!capabilityAllowed) throw invalid('APPROVAL_CONTEXT_CHANGED');
      const resources = CanonicalResourceRefSchema.array().max(50).safeParse(approval.resourceSnapshot);
      if (!resources.success || !await this.resources.areCurrent({
        organizationId: session.organization,
        actorId: input.actorId,
        resourceVersions: resources.data,
      })) throw invalid('APPROVAL_RESOURCE_VERSION_CHANGED');
    }

    if (!replayingDecision) assertApprovalDecision(approval.state, input.decision);
    const decision = replayingDecision
      ? { state: approval.state, changed: false }
      : await this.approvals.decideApproval({
          organizationId: session.organization,
          sessionId: session.session,
          approvalId: approval.id,
          expectedState: 'pending',
          decision: input.decision,
          actorType: 'human',
          actorId: input.actorId,
          idempotencyKey,
    });
    if (decision.state !== input.decision) throw invalid('APPROVAL_STATE_INVALID');

    // This event is the durable resolution of the visible interrupt. It must
    // exist before runtime work resumes so a reconnect cannot show a resolved
    // approval again after a browser or process restart.
    const persistedDecision = await this.runtimeControl.persist({
      organizationId: session.organization,
      sessionId: session.session,
      executionId: approval.executionId,
      externalEventId: `${approval.attemptId}:approval:${approval.id}:decision:${decision.state}`,
      eventType: 'hitl_decision',
      schemaVersion: 1,
      payload: {
        requestId: RequestIdSchema.parse(approval.id),
        decision: decision.state,
      },
    });
    await this.runtimeControl.publish(persistedDecision);

    if (decision.state === 'rejected') {
      if (!approval.operationRunId) throw invalid('APPROVAL_OPERATION_MISSING');
      await this.operations.cancel({
        organizationId: session.organization,
        runId: approval.operationRunId,
        requestedByUserId: input.actorId,
        reason: 'approval_rejected',
      });
      return { state: decision.state };
    }
    if (decision.state !== 'approved') throw invalid('APPROVAL_STATE_INVALID');
    if (!approval.operationRunId) throw invalid('APPROVAL_OPERATION_MISSING');
    await this.continuations.continueApproval({
      organizationId: session.organization,
      sessionId: session.session,
      approvalId: approval.id,
    });
    return { state: decision.state };
  }
}

function parseRequestGraph(input: RequestInput): {
  organizationId: string;
  sessionId: string;
  taskId: string;
  executionId: string;
  attemptId: string;
} {
  try {
    const session = parseAgentSessionName(input.session);
    const task = parseAgentSessionTaskName(input.task, input.session);
    const execution = parseAgentExecutionName(input.execution, input.session);
    const attempt = parseAgentExecutionAttemptName(input.attempt, input.execution);
    if (session.organization !== input.organizationId) throw new Error('organization mismatch');
    return {
      organizationId: session.organization,
      sessionId: session.session,
      taskId: task.task,
      executionId: execution.execution,
      attemptId: attempt.attempt,
    };
  } catch {
    throw invalid('APPROVAL_CONTEXT_CHANGED');
  }
}

function parseDecisionSession(input: DecideInput) {
  try {
    const session = parseAgentSessionName(input.session);
    if (session.organization !== input.organizationId) throw new Error('organization mismatch');
    return session;
  } catch {
    throw invalid('APPROVAL_CONTEXT_CHANGED');
  }
}

function boundedCapabilityKey(value: string): string {
  if (!/^[a-z][A-Za-z0-9]*(?:[._:-][A-Za-z0-9]+)*$/.test(value) || value.length > 128) {
    throw invalid('APPROVAL_CONTEXT_CHANGED');
  }
  return value;
}

function boundedSummary(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 500) throw invalid('APPROVAL_CONTEXT_CHANGED');
  return normalized;
}

function boundedKey(value: string): string {
  if (!value || value.length > 256) throw invalid('APPROVAL_CONTEXT_CHANGED');
  return value;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw invalid('APPROVAL_CONTEXT_CHANGED');
}

function invalid(code: string): AgentOsRuntimeError {
  return new AgentOsRuntimeError(code, code);
}
