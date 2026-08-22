import 'reflect-metadata';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { EventType, type BaseEvent } from '@ag-ui/core';
import { z } from 'zod';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { Page } from 'playwright/test';
import { AgentAguiController } from '../../../server/dist/agent-os/adapter/in/http/interaction/agent-agui.controller.js';
import { AgentInteractionBootstrapController } from '../../../server/dist/agent-os/adapter/in/http/interaction/agent-interaction-bootstrap.controller.js';
import { AgentInteractionControlController } from '../../../server/dist/agent-os/adapter/in/http/interaction/agent-interaction-control.controller.js';
import { AgentInteractionActionsController } from '../../../server/dist/agent-os/adapter/in/http/interaction/agent-interaction-actions.controller.js';
import { AgentSessionController } from '../../../server/dist/agent-os/adapter/in/http/session-control/agent-session.controller.js';
import { InteractionGatewayGuard } from '../../../server/dist/agent-os/adapter/in/http/interaction/interaction-gateway.guard.js';
import { ApiApplicationModule } from '../../../server/dist/api-application.module.js';
import { AGENT_AGUI_RUNNER_PORT } from '../../../server/dist/agent-os/application/port/in/agent-agui-runner.port.js';
import { AGENT_INTERACTION_AUTHORIZATION_PORT } from '../../../server/dist/agent-os/application/port/in/interaction/agent-interaction-authorization.port.js';
import { AGENT_INTERACTION_BOOTSTRAP_PORT } from '../../../server/dist/agent-os/application/port/in/interaction/agent-interaction-bootstrap.port.js';
import { AGENT_AGUI_PRODUCER_PORT } from '../../../server/dist/agent-os/application/port/in/interaction/agent-agui-producer.port.js';
import { AGENT_INTERACTION_LIVE_EVENTS_PORT } from '../../../server/dist/agent-os/application/port/in/interaction/agent-interaction-live-events.port.js';
import { AGENT_INTERACTION_PRESENTATION_PORT } from '../../../server/dist/agent-os/application/port/in/interaction/agent-interaction-presentation.port.js';
import { AGENT_SESSION_APPROVAL_DECISION_PORT } from '../../../server/dist/agent-os/application/port/in/session-control/agent-session-approval-decision.port.js';
import { AGENT_SESSION_TASK_CONTROL_PORT } from '../../../server/dist/agent-os/application/port/in/session-control/agent-session-task-control.port.js';
import { AGENT_SESSION_CAPABILITY_INVOCATION_PORT } from '../../../server/dist/agent-os/application/port/in/session-capability/agent-capability-invocation.port.js';
import { AGENT_SESSION_ARTIFACT_STORAGE_PORT } from '../../../server/dist/agent-os/application/port/out/storage/agent-session-artifact-storage.port.js';
import { AGENT_CONVERSATION_LIVE_PUBLISHER } from '../../../server/dist/agent-os/application/port/out/event/agent-conversation-live-publisher.port.js';
import { AGENT_SESSION_QUERY_REPOSITORY } from '../../../server/dist/agent-os/application/port/out/repository/interaction/agent-session-query.repository.port.js';
import { AGENT_CONVERSATION_QUERY_REPOSITORY } from '../../../server/dist/agent-os/application/port/out/repository/interaction/agent-conversation-query.repository.port.js';
import { AGENT_EXECUTION_QUERY_REPOSITORY } from '../../../server/dist/agent-os/application/port/out/repository/interaction/agent-execution-query.repository.port.js';
import { AGENT_RUN_AUTHORIZATION_TRANSACTION } from '../../../server/dist/agent-os/application/port/out/transaction/interaction/agent-run-authorization.transaction.port.js';
import { AGENT_CONVERSATION_EVENT_TRANSACTION } from '../../../server/dist/agent-os/application/port/out/transaction/interaction/agent-conversation-event.transaction.port.js';
import { AGENT_EXECUTION_USAGE_TRANSACTION } from '../../../server/dist/agent-os/application/port/out/transaction/interaction/agent-execution-usage.transaction.port.js';
import { AGENT_VERSION_REPOSITORY } from '../../../server/dist/agent-os/application/port/out/repository/agent-version.repository.port.js';
import { AGENT_SESSION_CONTROL_QUERY_REPOSITORY } from '../../../server/dist/agent-os/application/port/out/repository/session-control/agent-session-control-query.repository.port.js';
import { AGENT_DELEGATION_TRANSACTION } from '../../../server/dist/agent-os/application/port/out/transaction/session-control/agent-delegation.transaction.port.js';
import { AGENT_ATTEMPT_OPERATION_TRANSACTION } from '../../../server/dist/agent-os/application/port/out/transaction/session-control/agent-attempt-operation.transaction.port.js';
import { AGENT_APPROVAL_CONTINUATION_TRANSACTION } from '../../../server/dist/agent-os/application/port/out/transaction/session-control/agent-approval-continuation.transaction.port.js';
import { AGENT_SESSION_TRANSITION_TRANSACTION } from '../../../server/dist/agent-os/application/port/out/transaction/session-control/agent-session-transition.transaction.port.js';
import { AgentCapabilityRegistry } from '../../../server/dist/agent-os/application/service/agent-capability-registry.service.js';
import { AgentAguiRunService } from '../../../server/dist/agent-os/application/service/agent-agui-run.service.js';
import { AgentAguiProducerCoordinator } from '../../../server/dist/agent-os/application/service/agent-agui-producer-coordinator.service.js';
import { AgentAguiRuntimeRegistry } from '../../../server/dist/agent-os/application/service/agent-agui-runtime-registry.service.js';
import { AgentInteractionPresentationService } from '../../../server/dist/agent-os/application/service/agent-interaction-presentation.service.js';
import { AgentInteractionAuthorizationService } from '../../../server/dist/agent-os/application/service/interaction/agent-interaction-authorization.service.js';
import { AgentInteractionBootstrapService } from '../../../server/dist/agent-os/application/service/interaction/agent-interaction-bootstrap.service.js';
import { AgentInteractionLiveEventsService } from '../../../server/dist/agent-os/application/service/interaction/agent-interaction-live-events.service.js';
import { InteractionAllowedVersionResolver } from '../../../server/dist/agent-os/application/service/interaction/interaction-allowed-version-resolver.js';
import { AgentSessionCapabilityInvocationService } from '../../../server/dist/agent-os/application/service/agent-session-capability-invocation.service.js';
import { AgentSessionApprovalService } from '../../../server/dist/agent-os/application/service/session-control/agent-session-approval.service.js';
import { AgentSessionOperationContinuationService } from '../../../server/dist/agent-os/application/service/session-control/agent-session-operation-continuation.service.js';
import { AgentSessionCancellationService } from '../../../server/dist/agent-os/application/service/session-control/agent-session-cancellation.service.js';
import { AgentSessionDelegationService } from '../../../server/dist/agent-os/application/service/session-control/agent-session-delegation.service.js';
import { AgentSessionExecutionService } from '../../../server/dist/agent-os/application/service/session-control/agent-session-execution.service.js';
import { AgentSessionRuntimeControlService } from '../../../server/dist/agent-os/application/service/session-control/agent-session-runtime-control.service.js';
import { AgentSessionTaskDispatchService } from '../../../server/dist/agent-os/application/service/session-control/agent-session-task-dispatch.service.js';
import { AgentSessionOwnedOperationService } from '../../../server/dist/agent-os/application/service/session-control/agent-session-owned-operation.service.js';
import { AgentSessionTaskControlService } from '../../../server/dist/agent-os/application/service/session-control/agent-session-task-control.service.js';
import {
  INTERACTION_CLOCK,
  INTERACTION_GATEWAY_SHARED_SECRET,
  INTERACTION_PRINCIPAL_HMAC_KEY,
  INTERACTION_REPLAY_CURSOR_HMAC_KEY,
  INTERACTION_RUN_INTENT_HMAC_KEY,
} from '../../../server/dist/agent-os/application/port/in/interaction/interaction-gateway-config.port.js';
import { InProcessAgentConversationLivePublisher } from '../../../server/dist/agent-os/adapter/out/event/in-process-agent-conversation-live-publisher.adapter.js';
import { PrismaAgentSessionQueryRepository } from '../../../server/dist/agent-os/adapter/out/repository/interaction/prisma-agent-session-query.repository.js';
import { PrismaAgentConversationQueryRepository } from '../../../server/dist/agent-os/adapter/out/repository/interaction/prisma-agent-conversation-query.repository.js';
import { PrismaAgentExecutionQueryRepository } from '../../../server/dist/agent-os/adapter/out/repository/interaction/prisma-agent-execution-query.repository.js';
import { PrismaAgentVersionRepository } from '../../../server/dist/agent-os/adapter/out/repository/prisma-agent-version.repository.js';
import { PrismaAgentRunAuthorizationTransaction } from '../../../server/dist/agent-os/adapter/out/transaction/interaction/prisma-agent-run-authorization.transaction.js';
import { PrismaAgentConversationEventTransaction } from '../../../server/dist/agent-os/adapter/out/transaction/interaction/prisma-agent-conversation-event.transaction.js';
import { PrismaAgentExecutionUsageTransaction } from '../../../server/dist/agent-os/adapter/out/transaction/interaction/prisma-agent-execution-usage.transaction.js';
import { PrismaAgentSessionOwnedOperationTransaction } from '../../../server/dist/agent-os/adapter/out/transaction/session-control/prisma-agent-session-owned-operation.transaction.js';
import { OperationDefinitionSnapshotAdapter } from '../../../server/dist/agent-os/adapter/out/operation/operation-definition-snapshot.adapter.js';
import { SessionControlAdapterSet } from '../../../server/dist/agent-os/adapter/out/transaction/session-control/__tests__/session-control-adapter-set.js';
import { OperationRepositoryAdapter } from '../../../server/dist/operations/adapter/out/repository/operation.repository.adapter.js';
import { CompositeOperationCoordinatorService } from '../../../server/dist/operations/application/service/composite-operation-coordinator.service.js';
import { OperationHandlerRegistryService } from '../../../server/dist/operations/application/service/operation-handler-registry.service.js';
import { OperationLifecycleGateService } from '../../../server/dist/operations/application/service/operation-lifecycle-gate.service.js';
import { OperationRunService } from '../../../server/dist/operations/application/service/operation-run.service.js';
import { OperationRunWorkerService } from '../../../server/dist/operations/application/service/operation-run-worker.service.js';
import { AGENT_OS_OPERATIONS } from '../../../server/dist/agent-os/domain/operation/agent-os.operations.js';
import { InteractionProductAnalyticsAdapter } from '../../../server/dist/agent-os/adapter/out/event/interaction-product-analytics.adapter.js';
import { INTERACTION_PRODUCT_ANALYTICS_PORT } from '../../../server/dist/agent-os/application/port/out/event/interaction-product-analytics.port.js';
import { makeTestPrisma, OTHER_ORGANIZATION_ID, OTHER_USER_ID, seedBaseFixture, TEST_ORGANIZATION_ID, TEST_USER_ID } from '../../../server/dist/test-helpers/real-prisma.js';
import {
  formatAgentExecutionName,
  formatAgentExecutionAttemptName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  formatAgentVersionName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import { AgentProgressEventSchema } from '@kiditem/shared/agent-interaction';
import { hashAuthSessionToken } from '../../../server/dist/auth/domain/auth-credentials.js';
import { seedAgentOs } from '../../../server/dist/agent-os/seed-agent-os.js';
import type {
  AgentAguiRuntimeAdapter,
  AgentAguiRuntimeInput,
  AgentAguiRuntimeStopInput,
} from '../../../server/src/agent-os/application/port/out/runtime/agent-agui-runtime.port';
import type { AgentApprovalContinuationTransactionPort } from '../../../server/src/agent-os/application/port/out/transaction/session-control/agent-approval-continuation.transaction.port';
import type { AgentAttemptOperationTransactionPort } from '../../../server/src/agent-os/application/port/out/transaction/session-control/agent-attempt-operation.transaction.port';
import type { AgentSessionTransitionTransactionPort } from '../../../server/src/agent-os/application/port/out/transaction/session-control/agent-session-transition.transaction.port';
import { stopTrackedChild } from './tracked-child';

const repoRoot = path.resolve(__dirname, '../../../..');
const WEB_PORT = 4310;
const NEST_PORT = 4320;
const DELETION_API_PORT = 4321;
const GATEWAY_PORT = 4330;
const SERVICE_SECRET = 'e2e-interaction-gateway-secret-value-0001';
const HMAC = Buffer.from('e2e-interaction-hmac-secret-value-0000001');
let AGENT_VERSION_ID = '';
let DELEGATE_VERSION_ID = '';
const PRIMARY_TOKEN = 'p'.repeat(43);
const OTHER_TOKEN = 'o'.repeat(43);
const MEMBER_TOKEN = 'm'.repeat(43);
const MEMBER_USER_ID = '30000000-0000-4000-8000-000000000001';

interface DurableControlGraph {
  readonly copilotThreadId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly executionId: string;
  readonly childTaskId: string;
  readonly childExecutionId: string;
  readonly childAttemptId: string;
  readonly childOperationRunId: string;
  readonly approvalId: string | null;
  readonly staleApprovalId: string | null;
}

interface ActiveStopGraph {
  readonly copilotThreadId: string;
  readonly executionId: string;
  readonly aguiRunId: string;
}

type AcceptanceSessionControls =
  AgentApprovalContinuationTransactionPort &
  AgentAttemptOperationTransactionPort &
  AgentSessionTransitionTransactionPort;

class AcceptanceDurableControlPlane {
  private graph: DurableControlGraph | null = null;
  private beginStarted = false;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((reason: unknown) => void) | null = null;
  private readonly ready = new Promise<void>((resolve, reject) => {
    this.readyResolve = resolve;
    this.readyReject = reject;
  });
  private continueResolve: (() => void) | null = null;
  private progressResolve: (() => void) | null = null;
  private progressReject: ((reason: unknown) => void) | null = null;
  private readonly progressPersisted = new Promise<void>((resolve, reject) => {
    this.progressResolve = resolve;
    this.progressReject = reject;
  });
  private approvalResolve: (() => void) | null = null;
  private approvalReject: ((reason: unknown) => void) | null = null;
  private readonly approvalPersisted = new Promise<void>((resolve, reject) => {
    this.approvalResolve = resolve;
    this.approvalReject = reject;
  });
  private finishResolve: (() => void) | null = null;
  private activeStop: ActiveStopGraph | null = null;
  private activeStopResolve: (() => void) | null = null;
  private activeStopReadyResolve: (() => void) | null = null;
  private readonly activeStopReady = new Promise<void>((resolve) => {
    this.activeStopReadyResolve = resolve;
  });

  constructor(
    private readonly controls: AcceptanceSessionControls,
    private readonly runtimeControl: AgentSessionRuntimeControlService,
    private readonly delegations: AgentSessionDelegationService,
    private readonly approvals: AgentSessionApprovalService,
    private readonly presentation: AgentInteractionPresentationService,
    private readonly markApprovalBoundary: (operationRunId: string) => Promise<void>,
  ) {}

  async begin(input: AgentAguiRuntimeInput): Promise<void> {
    this.beginStarted = true;
    try {
    const organization = OrganizationIdSchema.parse(TEST_ORGANIZATION_ID);
    const session = formatAgentSessionName(organization, input.sessionId as never);
    const task = formatAgentSessionTaskName(organization, input.sessionId as never, input.sessionTaskId as never);
    const execution = formatAgentExecutionName(organization, input.sessionId as never, input.executionId as never);
    const delegated = await this.delegations.delegate({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: input.sessionId,
      parentTaskId: input.sessionTaskId,
      parentExecutionId: input.executionId,
      targetAgentDefinitionKey: 'sourcing',
      objective: '브라우저 durable 제어 검증',
      authoritySubset: ['sourcing.retrieveWorkspaceEvidence'],
      idempotencyKey: `acceptance:delegation:${input.executionId}`,
      requestedByUserId: TEST_USER_ID,
    });
    const attempt = await this.controls.findAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      operationRunId: delegated.operationsRunId,
    });
    if (!attempt) throw new Error('durable acceptance child attempt was not reserved');
    const activeAttempt = await this.controls.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: input.sessionId,
      executionId: delegated.childExecutionId,
      operationRunId: delegated.operationsRunId,
    });
    await this.controls.persistAttemptHandle({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: input.sessionId,
      executionId: delegated.childExecutionId,
      attemptId: activeAttempt.id,
      runtimeType: 'codex_cli',
      externalRunId: 'acceptance-external-child-run',
      encryptedHandleRef: 'vault://acceptance-child-handle',
      runtimeGeneration: 1,
    });
    await this.controls.transitionTask({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: input.sessionId,
      taskId: delegated.childTaskId,
      expectedState: 'queued',
      state: 'running',
    });
    const childTask = formatAgentSessionTaskName(organization, input.sessionId as never, delegated.childTaskId as never);
    const childExecution = formatAgentExecutionName(organization, input.sessionId as never, delegated.childExecutionId as never);
    const childAttempt = formatAgentExecutionAttemptName(
      organization,
      input.sessionId as never,
      delegated.childExecutionId as never,
      activeAttempt.id as never,
    );
    const navigation = this.presentation.present({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      sessionId: input.sessionId,
    }, {
      kind: 'navigation',
      routeKey: 'inventory_stock_ops',
      resourceRef: null,
      label: '산출물 열기',
      disabledReason: null,
      textFallback: '산출물 화면을 엽니다.',
    });
    if (navigation.kind !== 'navigation') throw new Error('durable acceptance navigation was not issued');
    const artifact = { id: randomUUID(), sha256: 'd'.repeat(64) };
    const now = new Date().toISOString();
    await this.runtimeControl.record({
      organizationId: TEST_ORGANIZATION_ID,
      session,
      task,
      execution,
      attemptId: randomUUID(),
      ordinal: 1,
      event: { kind: 'progress', progress: 0.25, label: '패널 닫힘 전 진행 상황' },
    });
    await this.runtimeControl.record({
      organizationId: TEST_ORGANIZATION_ID,
      session,
      task,
      execution,
      attemptId: randomUUID(),
      ordinal: 2,
      event: {
        kind: 'delegation',
        payload: {
          name: 'kiditem.ui.agent_delegation.v1',
          parentTask: task,
          childTask,
          fromAgentVersion: formatAgentVersionName('operator' as never, AGENT_VERSION_ID as never),
          toAgentVersion: formatAgentVersionName('sourcing' as never, DELEGATE_VERSION_ID as never),
          status: 'created',
          createdAt: now,
        },
      },
    });
    await this.runtimeControl.record({
      organizationId: TEST_ORGANIZATION_ID,
      session,
      task,
      execution,
      attemptId: randomUUID(),
      ordinal: 3,
      event: {
        kind: 'artifact',
        artifactId: artifact.id,
        payload: {
          artifactType: 'acceptance_report',
          label: '검증 산출물',
          sha256: artifact.sha256,
          navigationActionId: navigation.actionId,
        },
      },
    });
    this.graph = {
      copilotThreadId: input.copilotThreadId,
      sessionId: input.sessionId,
      taskId: input.sessionTaskId,
      executionId: input.executionId,
      childTaskId: delegated.childTaskId,
      childExecutionId: delegated.childExecutionId,
      childAttemptId: activeAttempt.id,
      childOperationRunId: delegated.operationsRunId,
      approvalId: null,
      staleApprovalId: null,
    };
    this.readyResolve?.();
    await new Promise<void>((resolve) => { this.continueResolve = resolve; });
    await this.runtimeControl.record({
      organizationId: TEST_ORGANIZATION_ID,
      session,
      task,
      execution,
      attemptId: randomUUID(),
      ordinal: 4,
      event: { kind: 'progress', progress: 0.75, label: '패널 닫힘 후 진행 상황' },
    });
    this.progressResolve?.();
    const waitingApprovalProgress = await this.runtimeControl.persist({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: input.sessionId,
      executionId: delegated.childExecutionId,
      externalEventId: `${activeAttempt.id}:acceptance:waiting-approval`,
      eventType: 'state_snapshot',
      schemaVersion: 1,
      payload: {
        snapshotType: 'agent_progress',
        snapshotVersion: 1,
        data: AgentProgressEventSchema.parse({
          name: 'kiditem.ui.agent_progress.v1',
          session,
          task: childTask,
          execution: childExecution,
          status: 'waiting_approval',
          progress: 0.5,
          label: '위임 작업의 승인 대기',
          updatedAt: new Date().toISOString(),
        }),
      },
    });
    await this.runtimeControl.publish(waitingApprovalProgress);
    await this.markApprovalBoundary(delegated.operationsRunId);
    const approval = await this.approvals.request({
      organizationId: TEST_ORGANIZATION_ID,
      session,
      task: childTask,
      execution: childExecution,
      attempt: childAttempt,
      operationRunId: delegated.operationsRunId,
      capabilityKey: 'sourcing.retrieveWorkspaceEvidence',
      arguments: { query: 'durable acceptance' },
      summary: '별도 승인이 필요한 durable 작업입니다.',
      resourceVersions: [],
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      idempotencyKey: `acceptance:approval:${delegated.childExecutionId}`,
    });
    await this.controls.transitionTask({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: input.sessionId,
      taskId: delegated.childTaskId,
      expectedState: 'running',
      state: 'waiting_approval',
    });
    this.graph = { ...this.current(), approvalId: approval.approvalId };
    this.approvalResolve?.();
    await new Promise<void>((resolve) => { this.finishResolve = resolve; });
    } catch (error) {
      this.readyReject?.(error);
      this.progressReject?.(error);
      this.approvalReject?.(error);
      throw error;
    }
  }

  async waitUntilReady(): Promise<void> {
    await Promise.race([
      this.ready,
      delay(10_000).then(() => {
        throw new Error(
          this.beginStarted
            ? 'durable runtime did not reach the persisted control boundary'
            : 'durable runtime never invoked the persisted control boundary',
        );
      }),
    ]);
  }

  async continueAfterPanelClose(): Promise<void> {
    const release = this.continueResolve;
    this.continueResolve = null;
    if (!release) throw new Error('durable runtime was not ready to continue');
    release();
    await Promise.race([
      Promise.all([this.progressPersisted, this.approvalPersisted]),
      delay(10_000).then(() => {
        throw new Error('durable runtime did not persist progress after panel close');
      }),
    ]);
  }

  finishAfterApproval(): void {
    const release = this.finishResolve;
    this.finishResolve = null;
    release?.();
  }

  async beginActiveStop(input: AgentAguiRuntimeInput): Promise<void> {
    this.activeStop = {
      copilotThreadId: input.copilotThreadId,
      executionId: input.executionId,
      aguiRunId: input.aguiRunId,
    };
    this.activeStopReadyResolve?.();
    await new Promise<void>((resolve) => { this.activeStopResolve = resolve; });
  }

  async waitForActiveStop(): Promise<void> {
    await Promise.race([
      this.activeStopReady,
      delay(10_000).then(() => {
        throw new Error('durable active run did not reach the gateway stop boundary');
      }),
    ]);
  }

  currentActiveStop(): ActiveStopGraph {
    if (!this.activeStop) throw new Error('durable active stop graph is not ready');
    return this.activeStop;
  }

  stopActiveRun(input: AgentAguiRuntimeStopInput): boolean {
    const active = this.activeStop;
    if (
      !active ||
      active.copilotThreadId !== input.copilotThreadId ||
      active.executionId !== input.executionId ||
      active.aguiRunId !== input.aguiRunId
    ) return false;
    const resolve = this.activeStopResolve;
    this.activeStopResolve = null;
    if (!resolve) return false;
    resolve();
    return true;
  }

  async createExpiredApproval(): Promise<string> {
    const graph = this.current();
    const stale = await this.controls.requestApproval({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      taskId: graph.childTaskId,
      executionId: graph.childExecutionId,
      attemptId: graph.childAttemptId,
      operationRunId: graph.childOperationRunId,
      capabilityKey: 'sourcing.retrieveWorkspaceEvidence',
      argumentsHash: createHash('sha256').update('stale').digest('hex'),
      resourceSnapshot: [],
      expiresAt: new Date(Date.now() - 1_000),
      idempotencyKey: `acceptance:approval:stale:${graph.childExecutionId}`,
    });
    this.graph = { ...graph, staleApprovalId: stale.id };
    return stale.id;
  }

  current(): DurableControlGraph {
    if (!this.graph) throw new Error('durable acceptance graph is not ready');
    return this.graph;
  }
}

class DeterministicAcceptanceRuntime implements AgentAguiRuntimeAdapter {
  constructor(
    private readonly presentation: AgentInteractionPresentationService,
    private readonly durableControls: AcceptanceDurableControlPlane,
  ) {}

  async *run(input: AgentAguiRuntimeInput): AsyncIterable<BaseEvent> {
    yield { type: EventType.RUN_STARTED, threadId: input.copilotThreadId, runId: input.aguiRunId };
    const submitted = input.messages.at(-1)?.content ?? '';
    if (submitted.includes('실패')) {
      yield { type: EventType.RUN_ERROR, code: 'DETERMINISTIC_FAILURE', message: 'deterministic failure' };
      return;
    }
    const messageId = `${input.aguiRunId}-assistant`;
    yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' };
    yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: '재고 현황을 확인했습니다.' };
    yield { type: EventType.TEXT_MESSAGE_END, messageId };
    if (submitted.includes('durable 제어')) {
      await this.durableControls.begin(input);
    }
    if (submitted.includes('gateway stop')) {
      await this.durableControls.beginActiveStop(input);
    }
    if (submitted.includes('새 대화')) {
      const analytics = await input.invokeCapability('analytics.readOverview', { period: 'today' });
      const sourcing = await input.invokeCapability('sourcing.retrieveWorkspaceEvidence', {
        query: '재고 위험 소싱 근거', topK: 3,
      });
      const results = [
        analytics.interactionUiResult,
        sourcing.interactionUiResult,
        {
          kind: 'suggested_replies', messageId,
          replies: [
            { id: '11111111-1111-4111-8111-111111111111', label: '후속 확인', content: '추천 후속 질문' },
            { id: '22222222-2222-4222-8222-222222222222', label: '상세 보기', content: '추천 상세 질문' },
          ], textFallback: '추천 질문이 있습니다.',
        },
        this.presentation.present({ organizationId: TEST_ORGANIZATION_ID, userId: TEST_USER_ID, sessionId: null }, {
          kind: 'navigation', routeKey: 'inventory_stock_ops', resourceRef: null,
          label: '재고 작업 열기', disabledReason: null, textFallback: '재고 작업으로 이동합니다.',
        }),
      ];
      for (const [index, result] of results.entries()) {
        if (!result) throw new Error('missing projected acceptance result');
        const toolCallId = `${input.aguiRunId}-tool-${index}`;
        yield { type: EventType.TOOL_CALL_START, toolCallId, toolCallName: index === 0 ? 'analytics.readOverview' : index === 1 ? 'sourcing.retrieveWorkspaceEvidence' : `acceptance.presentation.${index}` };
        yield { type: EventType.TOOL_CALL_ARGS, toolCallId, delta: '{}' };
        yield { type: EventType.TOOL_CALL_END, toolCallId };
        yield { type: EventType.TOOL_CALL_RESULT, messageId: `${toolCallId}-result`, toolCallId, content: JSON.stringify(result), role: 'tool' };
      }
    }
    yield { type: EventType.RUN_FINISHED, threadId: input.copilotThreadId, runId: input.aguiRunId };
  }

  async stop(input: AgentAguiRuntimeStopInput): Promise<boolean> {
    return this.durableControls.stopActiveRun(input);
  }
}

export interface CanonicalCounts { sessions: number; executions: number; events: number; outbox: number }

export interface DeletionHarnessControl {
  setStorageResult(result: 'erased' | 'present' | 'unknown'): void;
  releaseLateRuntimeEvent(): Promise<void>;
  makeCurrentDeletionDue(): Promise<void>;
  drainOneOperationAttempt(): Promise<void>;
  countSessionGraph(sessionId: string): Promise<Record<string, number>>;
}

class DeterministicDeletionStorage {
  private result: 'erased' | 'present' | 'unknown' = 'unknown';

  setResult(result: 'erased' | 'present' | 'unknown'): void {
    this.result = result;
  }

  async abortEraseAndConfirm() { return { state: this.result }; }
  async deleteActiveAndConfirm() { return { state: this.result }; }
  async inspect() { return this.result; }
}

export async function createAgentInteractionAcceptanceHarness() {
  if (process.env.KIDITEM_E2E_SKIP_WEB_BUILD !== '1') buildAcceptanceWeb();
  const postgres = await new PostgreSqlContainer('postgres:17')
    .withDatabase('kiditem_test')
    .withUsername('kiditem_test')
    .withPassword('kiditem_test')
    .withStartupTimeout(60_000)
    .start();
  process.env.DATABASE_URL = postgres.getConnectionUri();
  pushSchema(postgres);
  const prisma = makeTestPrisma();
  await prisma.$connect();
  await seedBaseFixture(prisma);
  await prisma.user.create({
    data: {
      id: MEMBER_USER_ID,
      email: 'member@test.local',
      name: 'Ordinary Member',
      role: 'member',
      type: 'human',
    },
  });
  await prisma.organizationMembership.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      userId: MEMBER_USER_ID,
      role: 'member',
      status: 'active',
    },
  });
  await seedAcceptanceAuthSessions(prisma);
  configureActualDeletionEnvironment();
  await seedAgentVersion(prisma);
  const analyticsEvents: unknown[] = [];
  const { app: nest, durableControls } = await startNest(prisma, analyticsEvents);
  const { app: deletionApi, deletionControl } = await startDeletionApiRoot(prisma);
  const gatewayLog: string[] = [];
  const webLog: string[] = [];
  const gateway = await startGateway(gatewayLog);
  const web = startWeb(webLog);
  try {
    await waitForUrl(`http://127.0.0.1:${WEB_PORT}/login`);
    await waitForUrl(`http://127.0.0.1:${GATEWAY_PORT}/health/ready`);
    await probeAcceptanceBoundaries();
  } catch (error) {
    await Promise.allSettled([
      stopTrackedChild(web),
      stopTrackedChild(gateway),
      nest.close(),
      deletionApi.close(),
      prisma.$disconnect(),
      postgres.stop(),
    ]);
    throw new Error(`acceptance setup failed: ${String(error)}; web=${JSON.stringify(webLog.slice(-30))}; gateway=${JSON.stringify(gatewayLog.slice(-20))}`);
  }

  return new AgentInteractionAcceptanceHarness(
    postgres, prisma, nest, deletionApi, gateway, web, gatewayLog, webLog, analyticsEvents, durableControls, deletionControl,
  );
}

class AgentInteractionAcceptanceHarness {
  private selectedThreadId: string | null = null;

  constructor(
    private readonly postgres: StartedPostgreSqlContainer,
    private readonly prisma: PrismaClient,
    private readonly nest: INestApplication,
    private readonly deletionApi: INestApplication,
    private gateway: ChildProcess,
    private readonly web: ChildProcess,
    private readonly gatewayLog: string[],
    private readonly webLog: string[],
    private readonly analyticsEvents: unknown[],
    private readonly durableControls: AcceptanceDurableControlPlane,
    private readonly deletionControl: AgentSessionDeletionAcceptanceControl,
  ) {}

  diagnostics() {
    return { gateway: this.gatewayLog.slice(-20), web: this.webLog.slice(-30) };
  }

  async authenticate(page: Page, identity: 'primary' | 'other-organization') {
    const token = identity === 'primary' ? PRIMARY_TOKEN : OTHER_TOKEN;
    await page.context().clearCookies();
    await page.context().addCookies([{ name: 'kiditem_session', value: token, url: `http://localhost:${WEB_PORT}` }]);
    await page.addInitScript(({ storageKey, value }) => localStorage.setItem(storageKey, JSON.stringify(value)), {
      storageKey: 'kiditem.auth.session.v1',
      value: { token, expiresAt: '2099-01-01T00:00:00.000Z' },
    });
  }

  async openPanel(page: Page, threadId?: string) {
    await page.getByRole('button', { name: '퀵 메뉴 열기' }).click();
    await page.getByRole('button', { name: 'AgentOS 대화 열기' }).click();
    if (threadId) {
      const selectedIdentifier = await page.getByLabel('선택된 대화 식별자').textContent();
      if (!selectedIdentifier?.includes(threadId)) {
        const session = await this.session(threadId);
        await page.getByRole('button', { name: `세션 ${session.id} 열기` }).click({ timeout: 10_000 });
      }
    }
  }

  async submit(page: Page, content: string): Promise<string> {
    const before = await this.prisma.agentExecution.count();
    const textbox = page.getByRole('textbox');
    console.log(`[agent-interaction:e2e] submit fill before=${before} content=${content}`);
    await textbox.fill(content, { timeout: 10_000 });
    console.log(`[agent-interaction:e2e] submit press before=${before} content=${content}`);
    await textbox.press('Enter', { timeout: 10_000 });
    console.log(`[agent-interaction:e2e] submit dispatched before=${before} content=${content}`);
    await this.waitForExecutionCount(before + 1);
    await this.waitForLatestExecutionTerminal();
    const session = await this.prisma.agentSession.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!session) throw new Error('accepted browser run did not create a session');
    this.selectedThreadId = session.copilotThreadId;
    return session.copilotThreadId;
  }

  async expectCanonicalCounts(expected: CanonicalCounts) {
    const [sessions, executions, events, outbox] = await Promise.all([
      this.prisma.agentSession.count(),
      this.prisma.agentExecution.count(),
      this.prisma.agentConversationEvent.count(),
      this.prisma.agentConversationOutbox.count(),
    ]);
    assertJson({ sessions, executions, events, outbox }, expected, 'canonical counts');
  }

  async expectFirstRunGraph(threadId: string) {
    const session = await this.prisma.agentSession.findUnique({ where: { organizationId_copilotThreadId: { organizationId: TEST_ORGANIZATION_ID, copilotThreadId: threadId } } });
    if (!session) throw new Error('missing canonical session');
    const [root, epoch, policy, execution, userEvent, outbox] = await Promise.all([
      this.prisma.agentSessionTask.count({ where: { sessionId: session.id, isRoot: true } }),
      this.prisma.agentContextEpoch.count({ where: { sessionId: session.id } }),
      this.prisma.agentPolicySnapshot.count({ where: { sessionId: session.id } }),
      this.prisma.agentExecution.count({ where: { sessionId: session.id } }),
      this.prisma.agentConversationEvent.count({ where: { sessionId: session.id, eventType: 'user_message' } }),
      this.prisma.agentConversationOutbox.count({ where: { event: { sessionId: session.id } } }),
    ]);
    assertJson({ root, epoch, policy, execution, userEvent, outbox }, { root: 1, epoch: 1, policy: 1, execution: 1, userEvent: 1, outbox: 6 }, 'first run graph');
  }

  async expectReplayWithoutWrites(threadId: string) {
    const before = await this.counts();
    await delay(500);
    assertJson(await this.counts(), before, `replay wrote canonical rows for ${threadId}`);
  }

  async expectContinuation(threadId: string) {
    const session = await this.session(threadId);
    const executions = await this.prisma.agentExecution.count({ where: { sessionId: session.id } });
    if (executions !== 2) throw new Error(`expected two executions, received ${executions}`);
  }

  async expectReplayLiveBoundary(threadId: string) {
    const session = await this.session(threadId);
    const events = await this.prisma.agentConversationEvent.findMany({ where: { sessionId: session.id }, orderBy: { sequence: 'asc' } });
    const sequences = events.map((event) => event.sequence.toString());
    if (new Set(sequences).size !== sequences.length || sequences.some((value, index) => value !== String(index + 1))) {
      throw new Error('replay/live boundary contains a gap or duplicate');
    }
  }

  async expectDurableControlsAfterPanelClose(page: Page) {
    const threadId = await this.startDurableControlRun(page);
    await this.durableControls.waitUntilReady();
    let graph = this.durableControls.current();
    if (graph.copilotThreadId !== threadId) {
      throw new Error('durable control graph was attached to the wrong Copilot thread');
    }
    // An unrelated notification may remain visible while the durable control
    // graph advances. It must not block exercising the dialog's close action.
    await page.getByRole('button', { name: 'AgentOS 대화 닫기' }).click({ force: true });
    await this.durableControls.continueAfterPanelClose();
    graph = this.durableControls.current();
    if (!graph.approvalId) throw new Error('durable approval was not persisted');

    // The public gateway process has no authority map after this restart. The
    // browser must reconnect from canonical state while the approval is still
    // pending, then resolve that same persisted approval.
    await this.restartGateway();
    await page.reload();
    await this.openPanel(page, threadId);
    const progress = page.getByTestId(`agent-task-${graph.taskId}`)
      .getByRole('progressbar');
    await progress.waitFor({ timeout: 10_000 });
    if (await progress.getAttribute('aria-valuenow') !== '75') {
      throw new Error('progress produced after panel close was not replayed');
    }
    await page.getByLabel('Agent 위임').waitFor({ timeout: 10_000 });
    const approvalCard = page.getByLabel('Agent 승인 요청');
    await approvalCard.waitFor({ timeout: 10_000 });
    await approvalCard.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await approvalCard.getByRole('button', { name: '승인' }).click({ timeout: 10_000 });
    await this.waitForApprovalState(graph.approvalId, 'approved');
    await this.waitForExecutionTerminal(graph.executionId);
    const staleApprovalId = await this.durableControls.createExpiredApproval();

    const childTaskCard = page.getByTestId(`agent-task-${graph.childTaskId}`);
    await childTaskCard.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await childTaskCard.getByRole('button', { name: '취소' }).click({ timeout: 10_000 });
    const cancellationBinding = await this.prisma.agentExecutionAttemptOperationBinding.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        executionAttemptId: graph.childAttemptId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { operationRunId: true },
    });
    if (cancellationBinding.operationRunId === graph.childOperationRunId) {
      throw new Error('approval resume must cancel the immutable successor envelope, not the predecessor');
    }
    await this.waitForOperationStatus(cancellationBinding.operationRunId, 'cancelled');

    const stale = await page.request.post(
      `http://127.0.0.1:${NEST_PORT}/api/agent-os/sessions/${encodeURIComponent(graph.sessionId)}/approvals/${encodeURIComponent(staleApprovalId)}/decision`,
      {
        headers: { cookie: `kiditem_session=${PRIMARY_TOKEN}` },
        data: { decision: 'approved', idempotencyKey: randomUUID() },
      },
    );
    if (stale.ok()) throw new Error('expired approval was accepted');
    await this.waitForApprovalState(staleApprovalId, 'expired');

    await page.getByRole('button', { name: '검증 산출물 열기' }).click();
    await page.waitForURL('**/stock-ops', { timeout: 10_000 });
    const replayBefore = await this.counts();
    await page.goto('/dashboard');
    await this.openPanel(page, threadId);
    await delay(500);
    if (await page.getByLabel('Agent 승인 요청').count() !== 0) {
      throw new Error('resolved durable approval was replayed as pending');
    }
    assertJson(await this.counts(), replayBefore, 'durable replay after panel close');
  }

  async expectActiveRunStopAfterGatewayRestart(page: Page) {
    const before = await this.prisma.agentExecution.count();
    await page.goto('/dashboard');
    await this.openPanel(page);
    await page.getByRole('button', { name: '새 대화' }).click();
    const textbox = page.getByRole('textbox');
    await textbox.fill('gateway stop 검증');
    await textbox.press('Enter');
    await this.waitForExecutionCount(before + 1);
    await this.durableControls.waitForActiveStop();
    const active = this.durableControls.currentActiveStop();
    const beforeRestart = await this.prisma.agentExecution.findUniqueOrThrow({
      where: { id: active.executionId },
    });
    if (beforeRestart.status !== 'running') {
      throw new Error('gateway stop fixture was not canonically running before restart');
    }

    await this.restartGateway();
    await page.reload();
    await this.openPanel(page, active.copilotThreadId);
    const response = await page.request.post(
      `http://127.0.0.1:${GATEWAY_PORT}/api/copilotkit/agent/operator/stop/${encodeURIComponent(active.copilotThreadId)}`,
      { headers: { cookie: `kiditem_session=${PRIMARY_TOKEN}` } },
    );
    if (!response.ok() || (await response.json() as { stopped?: unknown }).stopped !== true) {
      throw new Error('gateway restart could not stop the canonical active run');
    }
    await this.waitForExecutionTerminal(active.executionId);
  }

  async restartGateway() {
    const previous = this.gateway;
    await stopTrackedChild(previous);
    this.gateway = await startGateway(this.gatewayLog);
    await waitForUrl(`http://127.0.0.1:${GATEWAY_PORT}/health/ready`);
  }

  async expectReplayAfterGatewayRestart(page: Page, threadId: string) {
    const before = await this.counts();
    await page.reload();
    await this.openPanel(page, threadId);
    await this.expectReplayWithoutWrites(threadId);
    assertJson(await this.counts(), before, 'gateway restart replay wrote canonical rows');
  }

  async startNewConversationAndSubmit(page: Page, content: string) {
    await page.getByRole('button', { name: '새 대화' }).click();
    return this.submit(page, content);
  }

  async expectFailedDispatchRetryKeepsSession(page: Page, threadId: string) {
    const session = await this.session(threadId);
    const sessionCount = await this.prisma.agentSession.count();
    const before = await this.prisma.agentExecution.count({ where: { sessionId: session.id } });
    await this.submit(page, '실패 요청');
    const failed = await this.prisma.agentExecution.findFirstOrThrow({ where: { sessionId: session.id }, orderBy: { startedAt: 'desc' } });
    if (failed.status !== 'failed') throw new Error(`expected failed execution, received ${failed.status}`);
    await this.submit(page, '재시도 성공');
    const after = await this.prisma.agentExecution.count({ where: { sessionId: session.id } });
    if (after !== before + 2 || await this.prisma.agentSession.count() !== sessionCount) throw new Error('retry changed session or execution count');
  }

  async expectSafeAnalyticsAndSourcingRenderer(page: Page) {
    await page.getByText('운영 지표').waitFor({ timeout: 10_000 });
    await page.getByText('품절 SKU', { exact: true }).waitFor({ timeout: 10_000 });
    await page.getByText('근거 1').waitFor({ timeout: 10_000 });
    if (!this.selectedThreadId) throw new Error('missing selected thread for analytics');
    const session = await this.session(this.selectedThreadId);
    const actual = this.analyticsEvents.find((value) => {
      const event = value as { sessionId?: unknown; rendererKinds?: unknown };
      return event.sessionId === session.id &&
        Array.isArray(event.rendererKinds) &&
        event.rendererKinds.includes('metric_group') &&
        event.rendererKinds.includes('resource_list');
    });
    if (!actual) throw new Error('terminal flow did not emit product analytics');
    const serialized = JSON.stringify(actual);
    for (const forbidden of [TEST_ORGANIZATION_ID, TEST_USER_ID, '연필 세트', '재고 현황을 확인했습니다.', 'cookie', 'token', 'dashboard']) {
      if (serialized.includes(forbidden)) throw new Error(`unsafe analytics field leaked: ${forbidden}`);
    }
  }

  async expectSuggestionSendsOnce(page: Page) {
    if (!this.selectedThreadId) throw new Error('missing selected thread');
    const session = await this.session(this.selectedThreadId);
    const before = await this.prisma.agentExecution.count({ where: { sessionId: session.id } });
    const globalBefore = await this.prisma.agentExecution.count();
    await page.getByRole('button', { name: '후속 확인' }).click();
    await this.waitForExecutionCount(globalBefore + 1);
    const after = await this.prisma.agentExecution.count({ where: { sessionId: session.id } });
    if (after !== before + 1) throw new Error('suggested reply did not create exactly one user turn');
    if (await page.getByRole('button', { name: '상세 보기' }).count()) throw new Error('suggestion siblings were not consumed');
  }

  async expectAuthorizedNavigation(page: Page) {
    const request = page.waitForRequest((candidate) => candidate.url().includes('/actions/authorize'));
    await page.getByRole('button', { name: '재고 작업 열기' }).click();
    const posted = await request;
    const body = posted.postDataJSON();
    if (Object.keys(body).length !== 1 || typeof body.actionId !== 'string') throw new Error('navigation posted more than actionId');
    await page.waitForURL('**/stock-ops', { timeout: 10_000 });
  }

  async expectPanelAndWorkspaceShareThread(page: Page, threadId: string) {
    await page.goto('/dashboard');
    await this.openPanel(page, threadId);
    const panelIdentifier = await page.getByLabel('선택된 대화 식별자').textContent();
    await page.getByRole('link', { name: 'AgentOS 워크스페이스' }).click();
    await page.getByRole('button', { name: 'Operator 대화' }).click();
    const workspaceIdentifier = await page.getByLabel('선택된 대화 식별자').textContent();
    if (!panelIdentifier || workspaceIdentifier !== panelIdentifier || !workspaceIdentifier.includes(threadId)) throw new Error('workspace lost shared thread');
  }

  async expectSessionUnavailable(page: Page, threadId: string) {
    const response = await page.request.post(`http://127.0.0.1:${NEST_PORT}/api/agent-os/interaction/connections/authorize`, {
      headers: { cookie: `kiditem_session=${OTHER_TOKEN}`, 'x-kiditem-interaction-gateway': SERVICE_SECRET },
      data: { copilotThreadId: threadId },
    });
    if (response.ok()) throw new Error('cross-organization session was available');
  }

  async expectCompleteDeletion(page: Page): Promise<void> {
    if (!this.selectedThreadId) throw new Error('missing selected session for deletion acceptance');
    const session = await this.session(this.selectedThreadId);
    await this.deletionControl.prepare(session.id);
    // Deletion requests go through the separately booted ApiApplicationModule
    // with persisted AuthSession credentials. The interaction-only test app
    // remains responsible solely for deterministic browser/runtime behavior.
    const headers = { authorization: `Bearer ${PRIMARY_TOKEN}` };
    const route = `http://127.0.0.1:${DELETION_API_PORT}/api/agent-os/sessions/${session.id}`;
    const eventCountAtFence = await this.prisma.agentConversationEvent.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: session.id },
    });

    const requested = await page.request.delete(route, { headers });
    if (requested.status() !== 202 || (await requested.json() as { state?: unknown }).state !== 'deleting') {
      throw new Error('creator deletion request was not accepted as deleting');
    }
    const status = await page.request.get(`${route}/deletion`, { headers });
    if (status.status() !== 200 || (await status.json() as { state?: unknown }).state !== 'deleting') {
      throw new Error('creator deletion status was not visible as deleting');
    }
    const foreignHeaders = { authorization: `Bearer ${OTHER_TOKEN}` };
    for (const [label, request] of [
      ['delete', () => page.request.delete(route, { headers: foreignHeaders })],
      ['status', () => page.request.get(`${route}/deletion`, { headers: foreignHeaders })],
      ['retry', () => page.request.post(`${route}/deletion/retry`, { headers: foreignHeaders })],
    ] as const) {
      const response = await request();
      if (response.status() !== 204) {
        throw new Error(`cross-organization deletion ${label} was enumerable`);
      }
    }
    const memberHeaders = { authorization: `Bearer ${MEMBER_TOKEN}` };
    for (const [label, request] of [
      ['delete', () => page.request.delete(route, { headers: memberHeaders })],
      ['status', () => page.request.get(`${route}/deletion`, { headers: memberHeaders })],
      ['retry', () => page.request.post(`${route}/deletion/retry`, { headers: memberHeaders })],
    ] as const) {
      const response = await request();
      if (response.status() !== 204) {
        throw new Error(`ordinary same-organization member ${label} was enumerable`);
      }
    }
    const history = await page.request.get(
      `http://127.0.0.1:${NEST_PORT}/api/agent-os/interaction/bootstrap`,
      { headers: { cookie: `kiditem_session=${PRIMARY_TOKEN}` } },
    );
    if (!history.ok() || JSON.stringify(await history.json()).includes(this.selectedThreadId)) {
      throw new Error('deleting session remained visible in interaction history');
    }
    await this.deletionControl.releaseLateRuntimeEvent();
    const afterLateEvent = await this.prisma.agentConversationEvent.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: session.id },
    });
    if (afterLateEvent !== eventCountAtFence) throw new Error('late runtime event changed canonical history');

    this.deletionControl.setStorageResult('unknown');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await this.deletionControl.makeCurrentDeletionDue();
      await this.deletionControl.drainOneOperationAttempt();
    }
    const failed = await page.request.get(`${route}/deletion`, { headers });
    const failedBody = await failed.json() as { state?: unknown; failureCode?: unknown };
    if (failed.status() !== 200 || failedBody.state !== 'delete_failed' || failedBody.failureCode !== 'STORAGE_DELETE_UNKNOWN') {
      throw new Error(`five deterministic deletion failures did not reach delete_failed: ${JSON.stringify(failedBody)}`);
    }

    const membership = await this.prisma.organizationMembership.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, userId: TEST_USER_ID, status: 'active' },
      select: { id: true },
    });
    await this.prisma.organizationMembership.update({ where: { id: membership.id }, data: { role: 'member' } });
    const creatorRetry = await page.request.post(`${route}/deletion/retry`, { headers });
    if (creatorRetry.status() !== 403) throw new Error('non-administrator creator retry was not forbidden');
    await this.prisma.organizationMembership.update({ where: { id: membership.id }, data: { role: 'owner' } });

    this.deletionControl.setStorageResult('erased');
    const retried = await page.request.post(`${route}/deletion/retry`, { headers });
    if (retried.status() !== 202 || (await retried.json() as { state?: unknown }).state !== 'deleting') {
      throw new Error('administrator retry was not accepted as deleting');
    }
    await this.deletionControl.drainOneOperationAttempt();
    const absent = await page.request.get(`${route}/deletion`, { headers });
    if (absent.status() !== 204) throw new Error('deleted session deletion status was not absent');
    assertJson(await this.deletionControl.countSessionGraph(session.id), {
      sessions: 0,
      tasks: 0,
      executions: 0,
      attempts: 0,
      events: 0,
      approvals: 0,
      artifacts: 0,
      artifactMaterializations: 0,
      ownerships: 0,
      deletionBindings: 0,
      deletionRuns: 0,
    }, 'complete deletion graph');
  }

  async close() {
    // Browser pages can retain an SSE connection through the gateway. Stop
    // that owned boundary first so Nest shutdown cannot wait on the client.
    await stopTrackedChild(this.gateway);
    await stopTrackedChild(this.web);
    await Promise.allSettled([
      this.nest.close(),
      this.deletionApi.close(),
      this.prisma.$disconnect(),
    ]);
    await this.postgres.stop();
  }

  private async counts() {
    const [sessions, executions, events, outbox] = await Promise.all([
      this.prisma.agentSession.count(), this.prisma.agentExecution.count(),
      this.prisma.agentConversationEvent.count(), this.prisma.agentConversationOutbox.count(),
    ]);
    return { sessions, executions, events, outbox };
  }

  private async startDurableControlRun(page: Page): Promise<string> {
    const before = await this.prisma.agentExecution.count();
    await page.getByRole('button', { name: '새 대화' }).click();
    const textbox = page.getByRole('textbox');
    await textbox.fill('durable 제어 검증');
    await textbox.press('Enter');
    await this.waitForExecutionCount(before + 1);
    const session = await this.prisma.agentSession.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!session) throw new Error('durable control run did not create a session');
    this.selectedThreadId = session.copilotThreadId;
    return session.copilotThreadId;
  }

  private async waitForApprovalState(approvalId: string, state: string) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const approval = await this.prisma.agentSessionApproval.findUnique({ where: { id: approvalId } });
      if (approval?.state === state) return;
      await delay(100);
    }
    throw new Error(`timed out waiting for approval ${approvalId} to become ${state}`);
  }

  private async waitForOperationStatus(operationRunId: string, status: string) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const operation = await this.prisma.operationRun.findUnique({ where: { id: operationRunId } });
      if (operation?.status === status) return;
      await delay(100);
    }
    throw new Error(`timed out waiting for operation ${operationRunId} to become ${status}`);
  }

  private session(copilotThreadId: string) {
    return this.prisma.agentSession.findUniqueOrThrow({
      where: { organizationId_copilotThreadId: { organizationId: TEST_ORGANIZATION_ID, copilotThreadId } },
    });
  }

  private async waitForExecutionCount(expected: number) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await this.prisma.agentExecution.count() >= expected) return;
      await delay(100);
    }
    throw new Error(`timed out waiting for ${expected} executions`);
  }

  private async waitForLatestExecutionTerminal() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const execution = await this.prisma.agentExecution.findFirst({ orderBy: { startedAt: 'desc' } });
      if (execution && execution.status !== 'running') return;
      await delay(100);
    }
    throw new Error('timed out waiting for terminal execution');
  }

  private async waitForExecutionTerminal(executionId: string) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const execution = await this.prisma.agentExecution.findUnique({ where: { id: executionId } });
      if (execution && execution.status !== 'running') return;
      await delay(100);
    }
    throw new Error(`timed out waiting for execution ${executionId} to become terminal`);
  }
}

class AgentSessionDeletionAcceptanceControl implements DeletionHarnessControl {
  private sessionId: string | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: DeterministicDeletionStorage,
    private readonly worker: OperationRunWorkerService,
    private readonly events: PrismaAgentConversationEventTransaction,
    private readonly ownedOperations: AgentSessionOwnedOperationService,
  ) {}

  async prepare(sessionId: string): Promise<void> {
    const organizationId = OrganizationIdSchema.parse(TEST_ORGANIZATION_ID);
    const execution = await this.prisma.agentExecution.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId },
      orderBy: { startedAt: 'asc' },
      select: { id: true, sessionTaskId: true },
    });
    const materialization = await this.ownedOperations.startCapability({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId,
      operationKey: AGENT_OS_OPERATIONS[0].key,
      requestedByUserId: TEST_USER_ID,
      idempotencyKey: `deletion-acceptance-materialization:${sessionId}`,
      input: {
        session: formatAgentSessionName(organizationId, sessionId as never),
        task: formatAgentSessionTaskName(
          organizationId,
          sessionId as never,
          execution.sessionTaskId as never,
        ),
        execution: formatAgentExecutionName(
          organizationId,
          sessionId as never,
          execution.id as never,
        ),
      },
    });
    // This is a retained, completed capability fixture that gives the active
    // artifact a real Operations ownership edge. It is deliberately not a
    // handcrafted deletion run: DELETE below creates that run through the
    // separately booted API controller and its registered handler.
    await this.prisma.operationRun.update({
      where: { id: materialization.operationRunId },
      data: { status: 'succeeded', finishedAt: new Date() },
    });
    await this.prisma.agentSessionArtifact.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId,
        taskId: execution.sessionTaskId,
        executionId: execution.id,
        artifactType: 'deletion_acceptance',
        materializationOperationRunId: materialization.operationRunId,
        sha256: 'd'.repeat(64),
        lifecycle: 'active',
        idempotencyKey: `deletion-acceptance:${sessionId}`,
      },
    });
    this.sessionId = sessionId;
  }

  setStorageResult(result: 'erased' | 'present' | 'unknown'): void {
    this.storage.setResult(result);
  }

  async releaseLateRuntimeEvent(): Promise<void> {
    const sessionId = this.requireSessionId();
    const before = await this.prisma.agentConversationEvent.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId },
    });
    const execution = await this.prisma.agentExecution.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId },
      select: { id: true },
    });
    await this.events.appendExecutionEvent({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId,
      executionId: execution.id,
      externalEventId: `late-deletion-event:${randomUUID()}`,
      eventType: 'assistant_message',
      schemaVersion: 1,
      payload: { phase: 'start', messageId: `late-deletion:${randomUUID()}` },
    } as never).then(
      () => { throw new Error('late runtime event bypassed the deletion fence'); },
      () => undefined,
    );
    const after = await this.prisma.agentConversationEvent.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId },
    });
    if (after !== before) throw new Error('late runtime event changed canonical history');
  }

  async makeCurrentDeletionDue(): Promise<void> {
    const sessionId = this.requireSessionId();
    const session = await this.prisma.agentSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { deletionOperationRunId: true },
    });
    if (!session.deletionOperationRunId) throw new Error('missing current deletion operation');
    await this.prisma.operationRun.update({
      where: { id: session.deletionOperationRunId },
      data: { scheduledFor: new Date(Date.now() - 1_000) },
    });
  }

  async drainOneOperationAttempt(): Promise<void> {
    await this.worker.tick();
    await this.worker.drainUntil(Date.now() + 10_000, true);
  }

  async countSessionGraph(sessionId: string): Promise<Record<string, number>> {
    const scope = { organizationId: TEST_ORGANIZATION_ID, sessionId };
    const [
      sessions,
      tasks,
      executions,
      attempts,
      events,
      approvals,
      artifacts,
      artifactMaterializations,
      ownerships,
      deletionBindings,
      deletionRuns,
    ] = await Promise.all([
      this.prisma.agentSession.count({ where: { id: sessionId, organizationId: TEST_ORGANIZATION_ID } }),
      this.prisma.agentSessionTask.count({ where: scope }),
      this.prisma.agentExecution.count({ where: scope }),
      this.prisma.agentExecutionAttempt.count({ where: scope }),
      this.prisma.agentConversationEvent.count({ where: scope }),
      this.prisma.agentSessionApproval.count({ where: scope }),
      this.prisma.agentSessionArtifact.count({ where: scope }),
      this.prisma.agentSessionArtifactMaterialization.count({ where: scope }),
      this.prisma.agentSessionOperationRunOwnership.count({ where: scope }),
      this.prisma.agentSessionDeletionOperationBinding.count({ where: scope }),
      this.prisma.operationRun.count({ where: { agentSessionDeletionOperationBindings: { is: scope } } }),
    ]);
    return {
      sessions,
      tasks,
      executions,
      attempts,
      events,
      approvals,
      artifacts,
      artifactMaterializations,
      ownerships,
      deletionBindings,
      deletionRuns,
    };
  }

  private requireSessionId(): string {
    if (!this.sessionId) throw new Error('deletion acceptance session is not prepared');
    return this.sessionId;
  }
}

async function seedAcceptanceAuthSessions(prisma: PrismaClient): Promise<void> {
  const expiresAt = new Date('2099-01-01T00:00:00.000Z');
  await prisma.authSession.createMany({
    data: [
      { userId: TEST_USER_ID, tokenHash: hashAuthSessionToken(PRIMARY_TOKEN), expiresAt },
      { userId: OTHER_USER_ID, tokenHash: hashAuthSessionToken(OTHER_TOKEN), expiresAt },
      { userId: MEMBER_USER_ID, tokenHash: hashAuthSessionToken(MEMBER_TOKEN), expiresAt },
    ],
  });
}

async function startDeletionApiRoot(prisma: PrismaClient): Promise<{
  app: INestApplication;
  deletionControl: AgentSessionDeletionAcceptanceControl;
}> {
  configureActualDeletionEnvironment();
  const storage = new DeterministicDeletionStorage();
  const moduleRef = await Test.createTestingModule({
    imports: [ApiApplicationModule],
  })
    // Test-only deletion-result control. It intentionally does not implement
    // materializationCapability/openMultipart/upload methods, so this narrow
    // fake cannot claim Hermes production materialization support.
    .overrideProvider(AGENT_SESSION_ARTIFACT_STORAGE_PORT)
    .useValue(storage)
    .compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableCors({ origin: `http://localhost:${WEB_PORT}`, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.listen(DELETION_API_PORT, '127.0.0.1');

  const registry = app.get(OperationHandlerRegistryService, { strict: false });
  if (!registry.listDefinitions().some((definition) => definition.key === 'agent-os.delete-session')) {
    throw new Error('actual API root did not register the AgentSession deletion handler');
  }
  const worker = app.get(OperationRunWorkerService, { strict: false });
  const ownedOperations = app.get(AgentSessionOwnedOperationService, { strict: false });
  return {
    app,
    deletionControl: new AgentSessionDeletionAcceptanceControl(
      prisma,
      storage,
      worker,
      new PrismaAgentConversationEventTransaction(prisma as never),
      ownedOperations,
    ),
  };
}

function configureActualDeletionEnvironment(): void {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    AGENT_DEFAULT_MODEL: 'deletion-browser-proof',
    AGENT_RUNTIME_CREDENTIAL_HMAC_KEY: 'd'.repeat(48),
    INTERACTION_GATEWAY_SHARED_SECRET: SERVICE_SECRET,
    INTERACTION_PRINCIPAL_HMAC_KEY: 'p'.repeat(48),
    INTERACTION_RUN_INTENT_HMAC_KEY: 'i'.repeat(48),
    INTERACTION_REPLAY_CURSOR_HMAC_KEY: 'r'.repeat(48),
    INTERACTION_ANALYTICS_HMAC_KEY: 'a'.repeat(48),
    OPERATION_RUNTIME_WORKER_ENABLED: '0',
    OPERATION_SCHEDULER_ENABLED: '0',
    AGENT_RUNTIME_WORKER_ENABLED: '0',
    AI_DIRECT_JOB_WORKER_ENABLED: '0',
  });
}

function registerAcceptanceCapabilities(registry: AgentCapabilityRegistry): void {
  registry.register({
    key: 'analytics.readOverview', ownerDomain: 'analytics', executionKind: 'tool',
    inputSchema: z.object({ period: z.enum(['today', 'month']).optional() }).strict(),
    outputSchema: z.object({
      sales: z.object({ revenue: z.number(), orders: z.number() }).strict(),
      inventory: z.object({ outOfStockSkus: z.number(), mappingAttentionSkus: z.number() }).strict(),
      freshness: z.object({ lastSync: z.string().datetime().nullable(), confirmedUntil: z.string().nullable() }).strict(),
    }).strict(),
    sideEffects: ['read'], approvalRisk: 'none', idempotencyKey: () => null,
    execute: async () => ({
      resourceType: 'analytics_overview',
      outputSummary: {
        sales: { revenue: 12000, orders: 3 },
        inventory: { outOfStockSkus: 1, mappingAttentionSkus: 0 },
        freshness: { lastSync: '2026-08-14T00:00:00.000Z', confirmedUntil: '2026-08-13' },
      },
    }),
  });
  registry.register({
    key: 'sourcing.retrieveWorkspaceEvidence', ownerDomain: 'sourcing', executionKind: 'tool',
    inputSchema: z.object({
      query: z.string().min(1), topK: z.number().int().positive().optional(),
    }).strict(),
    outputSchema: z.object({
      inputHash: z.string(), documentCount: z.number().int(),
      citationIds: z.array(z.string()), dataGaps: z.array(z.string()),
    }).strict(),
    sideEffects: ['read'], approvalRisk: 'none', idempotencyKey: () => null,
    execute: async () => ({
      resourceType: 'sourcing_workspace_evidence', resourceId: 'a'.repeat(64),
      outputSummary: {
        inputHash: 'a'.repeat(64), documentCount: 1,
        citationIds: ['document-1'], dataGaps: [],
      },
    }),
  });
}

async function startNest(
  prisma: PrismaClient,
  analyticsEvents: unknown[],
): Promise<{
  app: INestApplication;
  durableControls: AcceptanceDurableControlPlane;
}> {
  const sessions = new PrismaAgentSessionQueryRepository(prisma as never);
  const conversations = new PrismaAgentConversationQueryRepository(prisma as never);
  const executionsQuery = new PrismaAgentExecutionQueryRepository(prisma as never);
  const authorization = new PrismaAgentRunAuthorizationTransaction(prisma as never);
  const events = new PrismaAgentConversationEventTransaction(prisma as never);
  const usage = new PrismaAgentExecutionUsageTransaction(prisma as never);
  const controls = new SessionControlAdapterSet(prisma as never);
  const versions = new PrismaAgentVersionRepository(prisma as never);
  const allowedVersions = new InteractionAllowedVersionResolver(versions);
  const publisher = new InProcessAgentConversationLivePublisher();
  const presentation = new AgentInteractionPresentationService();
  const operationRepository = new OperationRepositoryAdapter(prisma as never);
  const operationRegistry = new OperationHandlerRegistryService();
  operationRegistry.register(AGENT_OS_OPERATIONS[0], {
    execute: async () => ({ kind: 'completed', result: {} }),
    cancel: async () => undefined,
  } as never);
  const operationLifecycle = new OperationLifecycleGateService();
  operationLifecycle.open();
  const operationCoordinator = new CompositeOperationCoordinatorService(
    operationRegistry,
    operationRepository,
    operationLifecycle,
  );
  const operations = new OperationRunService(
    operationRegistry,
    operationRepository,
    operationCoordinator,
    operationLifecycle,
  );
  const dispatch = new AgentSessionTaskDispatchService(
    new AgentSessionOwnedOperationService(
      new OperationDefinitionSnapshotAdapter(operationRegistry, operationLifecycle),
      new PrismaAgentSessionOwnedOperationTransaction(prisma as never),
    ),
  );
  const runtimeControl = new AgentSessionRuntimeControlService(
    events,
    publisher,
    () => new Date(),
  );
  let durableControls: AcceptanceDurableControlPlane | null = null;
  const approvalRuntime = {
    runtimeType: 'codex_cli',
    capabilities: { detached: true, reconnect: true, interrupt: true, cancel: true, inspect: true },
    start: async () => { throw new Error('acceptance approval runtime must reconnect'); },
    inspect: async () => ({ status: 'running' as const }),
    connect: async function* () {},
    interrupt: async () => {
      durableControls?.finishAfterApproval();
    },
    cancel: async () => undefined,
  };
  const continuations = new AgentSessionOperationContinuationService(
    controls as never,
    controls as never,
    controls as never,
    operationLifecycle,
    { requireCompatible: () => approvalRuntime } as never,
  );
  const approvals = new AgentSessionApprovalService(
    controls as never,
    controls as never,
    runtimeControl,
    { areCurrent: async () => true } as never,
    operations,
    continuations,
    () => new Date(),
  );
  const cancellations = new AgentSessionCancellationService(controls as never, operations);
  const executions = new AgentSessionExecutionService(controls as never, controls as never, dispatch);
  const delegations = new AgentSessionDelegationService(controls as never, controls as never, dispatch);
  const taskControls = new AgentSessionTaskControlService(executions, cancellations);
  const bootstrap = new AgentInteractionBootstrapService(
    sessions,
    () => new Date(),
    HMAC,
    HMAC,
    allowedVersions,
  );
  const interactionAuthorization = new AgentInteractionAuthorizationService(
    sessions,
    conversations,
    executionsQuery,
    authorization,
    versions,
    () => new Date(),
    HMAC,
    HMAC,
    allowedVersions,
  );
  const liveEvents = new AgentInteractionLiveEventsService(
    interactionAuthorization,
    conversations,
    publisher,
  );
  const createdDurableControls = new AcceptanceDurableControlPlane(
    controls as never,
    runtimeControl,
    delegations,
    approvals,
    presentation,
    async (operationRunId) => {
      const transitioned = await operationRepository.transition({
        organizationId: TEST_ORGANIZATION_ID,
        runId: operationRunId,
        expectedStatuses: ['queued'],
        status: 'attention_required',
        errorCode: 'acceptance_approval_required',
        errorMessage: 'acceptance approval boundary',
        finishedAt: new Date(),
      });
      if (!transitioned) {
        throw new Error('durable acceptance operation did not enter approval boundary');
      }
    },
  );
  durableControls = createdDurableControls;
  const runtimeRegistry = new AgentAguiRuntimeRegistry();
  runtimeRegistry.register(
    'copilotkit_agui',
    new DeterministicAcceptanceRuntime(presentation, createdDurableControls),
  );
  const capabilityRegistry = new AgentCapabilityRegistry();
  registerAcceptanceCapabilities(capabilityRegistry);
  const moduleRef = await Test.createTestingModule({
    controllers: [
      AgentInteractionBootstrapController,
      AgentInteractionControlController,
      AgentInteractionActionsController,
      AgentAguiController,
      AgentSessionController,
    ],
    providers: [
      { provide: AGENT_SESSION_QUERY_REPOSITORY, useValue: sessions },
      { provide: AGENT_CONVERSATION_QUERY_REPOSITORY, useValue: conversations },
      { provide: AGENT_EXECUTION_QUERY_REPOSITORY, useValue: executionsQuery },
      { provide: AGENT_RUN_AUTHORIZATION_TRANSACTION, useValue: authorization },
      { provide: AGENT_CONVERSATION_EVENT_TRANSACTION, useValue: events },
      { provide: AGENT_EXECUTION_USAGE_TRANSACTION, useValue: usage },
      { provide: AGENT_VERSION_REPOSITORY, useValue: versions },
      { provide: AGENT_SESSION_CONTROL_QUERY_REPOSITORY, useValue: controls },
      { provide: AGENT_DELEGATION_TRANSACTION, useValue: controls },
      { provide: AGENT_ATTEMPT_OPERATION_TRANSACTION, useValue: controls },
      { provide: AGENT_APPROVAL_CONTINUATION_TRANSACTION, useValue: controls },
      { provide: AGENT_SESSION_TRANSITION_TRANSACTION, useValue: controls },
      { provide: AGENT_INTERACTION_BOOTSTRAP_PORT, useValue: bootstrap },
      { provide: AGENT_INTERACTION_AUTHORIZATION_PORT, useValue: interactionAuthorization },
      { provide: AGENT_INTERACTION_LIVE_EVENTS_PORT, useValue: liveEvents },
      { provide: AGENT_INTERACTION_PRESENTATION_PORT, useValue: presentation },
      { provide: AGENT_AGUI_PRODUCER_PORT, useExisting: AgentAguiProducerCoordinator },
      { provide: AGENT_SESSION_TASK_CONTROL_PORT, useValue: taskControls },
      { provide: AGENT_SESSION_APPROVAL_DECISION_PORT, useValue: approvals },
      { provide: AGENT_CONVERSATION_LIVE_PUBLISHER, useValue: publisher },
      { provide: INTERACTION_CLOCK, useValue: () => new Date() },
      { provide: INTERACTION_GATEWAY_SHARED_SECRET, useValue: Buffer.from(SERVICE_SECRET) },
      { provide: INTERACTION_PRINCIPAL_HMAC_KEY, useValue: HMAC },
      { provide: INTERACTION_RUN_INTENT_HMAC_KEY, useValue: HMAC },
      { provide: INTERACTION_REPLAY_CURSOR_HMAC_KEY, useValue: HMAC },
      { provide: AgentAguiRuntimeRegistry, useValue: runtimeRegistry },
      { provide: AgentInteractionPresentationService, useValue: presentation },
      {
        provide: InteractionProductAnalyticsAdapter,
        useFactory: () => new InteractionProductAnalyticsAdapter(
          'acceptance-analytics-hmac-key-value-0001',
          async (event) => { analyticsEvents.push(event); },
        ),
      },
      { provide: INTERACTION_PRODUCT_ANALYTICS_PORT, useExisting: InteractionProductAnalyticsAdapter },
      { provide: AgentCapabilityRegistry, useValue: capabilityRegistry },
      AgentSessionCapabilityInvocationService,
      {
        provide: AGENT_SESSION_CAPABILITY_INVOCATION_PORT,
        useExisting: AgentSessionCapabilityInvocationService,
      },
      { provide: AgentSessionApprovalService, useValue: approvals },
      { provide: AgentSessionCancellationService, useValue: cancellations },
      { provide: AgentSessionExecutionService, useValue: executions },
      AgentAguiRunService,
      AgentAguiProducerCoordinator,
      { provide: AGENT_AGUI_RUNNER_PORT, useExisting: AgentAguiRunService },
      InteractionGatewayGuard,
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableCors({ origin: `http://localhost:${WEB_PORT}`, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.use('/api/inventory/sellpia-freshness', (request: any, response: any, next: () => void) => {
    if (request.method !== 'GET' || request.path !== '/') return next();
    return response.json({
      status: 'fresh',
      sourceBinding: { origin: 'https://kiditem.sellpia.com', accountKey: 'kiditem', confirmed: true },
      lastVerifiedAt: '2099-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:10:00.000Z',
      requestedGeneration: '1', verifiedGeneration: '1', refreshRequestedAt: null,
      refreshReason: null, requestedSyncScope: 'inventory', syncNotBefore: null,
      activeSync: null, lastAttempt: null,
    });
  });
  app.use('/api/auth/me', (request: any, response: any) => {
    const cookie = String(request.headers.cookie ?? '');
    const other = cookie.includes(OTHER_TOKEN);
    const member = cookie.includes(MEMBER_TOKEN);
    response.json({
      id: other ? OTHER_USER_ID : member ? MEMBER_USER_ID : TEST_USER_ID,
      email: other ? 'other@test.local' : member ? 'member@test.local' : 'test@test.local',
      name: other ? 'Other Tester' : member ? 'Ordinary Member' : 'Tester',
      role: member ? 'member' : 'owner', type: 'human',
      organizationId: other ? OTHER_ORGANIZATION_ID : TEST_ORGANIZATION_ID,
      membershipId: '33333333-3333-4333-8333-333333333333',
    });
  });
  app.use((request: any, _response: any, next: () => void) => {
    const cookie = String(request.headers.cookie ?? '');
    const identity = cookie.includes(OTHER_TOKEN)
      ? { id: OTHER_USER_ID, organizationId: OTHER_ORGANIZATION_ID, email: 'other@test.local', role: 'owner' }
      : cookie.includes(MEMBER_TOKEN)
        ? { id: MEMBER_USER_ID, organizationId: TEST_ORGANIZATION_ID, email: 'member@test.local', role: 'member' }
        : { id: TEST_USER_ID, organizationId: TEST_ORGANIZATION_ID, email: 'test@test.local', role: 'owner' };
    request.authUser = { ...identity, membershipId: '33333333-3333-4333-8333-333333333333', type: 'human' };
    next();
  });
  await app.listen(NEST_PORT, '127.0.0.1');
  return { app, durableControls: createdDurableControls };
}

async function startGateway(log: string[]): Promise<ChildProcess> {
  const child = spawn(process.execPath, [path.join(repoRoot, 'apps/interaction-gateway/dist/server.js')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      INTERACTION_GATEWAY_PORT: String(GATEWAY_PORT),
      KIDITEM_API_INTERNAL_URL: `http://127.0.0.1:${NEST_PORT}`,
      AGENT_OS_AGUI_INTERNAL_URL: `http://127.0.0.1:${NEST_PORT}/api/agent-os/ag-ui`,
      INTERACTION_GATEWAY_SHARED_SECRET: SERVICE_SECRET,
      COPILOTKIT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  collectOutput(child, log);
  await waitForUrl(`http://127.0.0.1:${GATEWAY_PORT}/health/live`);
  return child;
}

function startWeb(log: string[]): ChildProcess {
  const child = spawn(process.execPath, [path.join(repoRoot, 'node_modules/next/dist/bin/next'), 'start', 'apps/web', '-p', String(WEB_PORT)], {
    cwd: repoRoot,
    env: { ...process.env, NEXT_PUBLIC_API_URL: `http://127.0.0.1:${NEST_PORT}`, KIDITEM_PROXY_ALL_API: 'true', INTERACTION_GATEWAY_URL: `http://127.0.0.1:${GATEWAY_PORT}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  collectOutput(child, log);
  return child;
}

function buildAcceptanceWeb() {
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build', '--workspace=apps/web'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: `http://127.0.0.1:${NEST_PORT}`,
      INTERACTION_GATEWAY_URL: `http://127.0.0.1:${GATEWAY_PORT}`,
    },
    stdio: 'ignore',
  });
}

function collectOutput(child: ChildProcess, log: string[]) {
  child.on('exit', (code, signal) => {
    log.push(`[child-exit] pid=${child.pid ?? 'unknown'} code=${code ?? 'null'} signal=${signal ?? 'null'}`);
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk) => {
      log.push(...String(chunk).split('\n').filter(Boolean));
      if (log.length > 100) log.splice(0, log.length - 100);
    });
  }
}

function pushSchema(postgres: StartedPostgreSqlContainer) {
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', 'db', 'push'], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: postgres.getConnectionUri() },
    stdio: 'ignore',
  });
}

async function seedAgentVersion(prisma: PrismaClient) {
  // ApiApplicationModule validates every published runtime manifest during
  // bootstrap. Use the official seed rather than acceptance-only versions so
  // the browser deletion root proves the same catalog contract as production.
  await seedAgentOs(prisma);
  const [operator, sourcing] = await Promise.all([
    prisma.agentVersion.findFirstOrThrow({
      where: { agentDefinitionKey: 'operator', activatedAt: { not: null } },
      orderBy: { version: 'desc' },
      select: { id: true, runtimeType: true },
    }),
    prisma.agentVersion.findFirstOrThrow({
      where: { agentDefinitionKey: 'sourcing', activatedAt: { not: null } },
      orderBy: { version: 'desc' },
      select: { id: true, runtimeType: true },
    }),
  ]);
  if (operator.runtimeType !== 'copilotkit_agui' || sourcing.runtimeType !== 'codex_cli') {
    throw new Error('official AgentOS seed did not publish expected browser acceptance runtimes');
  }
  AGENT_VERSION_ID = operator.id;
  DELEGATE_VERSION_ID = sourcing.id;
}

async function waitForUrl(url: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(url).catch(() => null);
    if (response?.ok) return;
    await delay(250);
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function probeAcceptanceBoundaries() {
  const headers = { cookie: `kiditem_session=${PRIMARY_TOKEN}` };
  const probes = [
    fetch(`http://127.0.0.1:${NEST_PORT}/api/auth/me`, { headers }),
    fetch(`http://127.0.0.1:${NEST_PORT}/api/agent-os/interaction/bootstrap`, { headers }),
    fetch(`http://127.0.0.1:${GATEWAY_PORT}/health/ready`),
  ];
  const responses = await Promise.all(probes);
  const failed = responses.find((response) => !response.ok);
  if (failed) {
    throw new Error(`acceptance boundary readiness failed: ${failed.url} -> ${failed.status}`);
  }
}

function assertJson(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
}
