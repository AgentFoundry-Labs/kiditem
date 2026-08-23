import 'reflect-metadata';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { EventType, type BaseEvent } from '@ag-ui/core';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { Page } from 'playwright/test';
import { ApiApplicationModule } from '../../../server/dist/api-application.module.js';
import { AGENT_SESSION_ARTIFACT_STORAGE_PORT } from '../../../server/dist/agent-os/application/port/out/storage/agent-session-artifact-storage.port.js';
import { AGENT_APPROVAL_CONTINUATION_TRANSACTION } from '../../../server/dist/agent-os/application/port/out/transaction/session-control/agent-approval-continuation.transaction.port.js';
import { AGENT_ATTEMPT_OPERATION_TRANSACTION } from '../../../server/dist/agent-os/application/port/out/transaction/session-control/agent-attempt-operation.transaction.port.js';
import { AGENT_SESSION_TRANSITION_TRANSACTION } from '../../../server/dist/agent-os/application/port/out/transaction/session-control/agent-session-transition.transaction.port.js';
import { AgentAguiRuntimeRegistry } from '../../../server/dist/agent-os/application/service/agent-agui-runtime-registry.service.js';
import { AgentAguiStartupRecoveryService } from '../../../server/dist/agent-os/application/service/interaction/agent-agui-startup-recovery.service.js';
import { AgentRuntimeAdapterRegistry } from '../../../server/dist/agent-os/application/service/agent-runtime-adapter.registry.js';
import { OpenAiResponsesAguiRuntimeAdapter } from '../../../server/dist/agent-os/adapter/out/runtime/openai-responses-agui-runtime.adapter.js';
import { LocalCliRuntimeStartupRegistrar } from '../../../server/dist/agent-os/adapter/out/runtime/local-cli-runtime-registrar.js';
import { AgentInteractionPresentationService } from '../../../server/dist/agent-os/application/service/agent-interaction-presentation.service.js';
import { AgentSessionApprovalService } from '../../../server/dist/agent-os/application/service/session-control/agent-session-approval.service.js';
import { AgentSessionDelegationService } from '../../../server/dist/agent-os/application/service/session-control/agent-session-delegation.service.js';
import { AgentSessionRuntimeControlService } from '../../../server/dist/agent-os/application/service/session-control/agent-session-runtime-control.service.js';
import { AgentSessionOwnedOperationService } from '../../../server/dist/agent-os/application/service/session-control/agent-session-owned-operation.service.js';
import { PrismaAgentConversationEventTransaction } from '../../../server/dist/agent-os/adapter/out/transaction/interaction/prisma-agent-conversation-event.transaction.js';
import { OperationRepositoryAdapter } from '../../../server/dist/operations/adapter/out/repository/operation.repository.adapter.js';
import { OperationHandlerRegistryService } from '../../../server/dist/operations/application/service/operation-handler-registry.service.js';
import { OperationRunWorkerService } from '../../../server/dist/operations/application/service/operation-run-worker.service.js';
import { AGENT_OS_OPERATIONS } from '../../../server/dist/agent-os/domain/operation/agent-os.operations.js';
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
import type { AgentDurableRuntimeAdapter } from '../../../server/src/agent-os/application/port/out/runtime/agent-durable-runtime.port';
import type { AgentApprovalContinuationTransactionPort } from '../../../server/src/agent-os/application/port/out/transaction/session-control/agent-approval-continuation.transaction.port';
import type { AgentAttemptOperationTransactionPort } from '../../../server/src/agent-os/application/port/out/transaction/session-control/agent-attempt-operation.transaction.port';
import type { AgentSessionTransitionTransactionPort } from '../../../server/src/agent-os/application/port/out/transaction/session-control/agent-session-transition.transaction.port';
import { stopTrackedChild } from './tracked-child';

// The production API entrypoint installs this parser before SessionAuthMiddleware.
// The test root keeps the same order while retaining the actual module graph.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as () => import('express').RequestHandler;

const repoRoot = path.resolve(__dirname, '../../../..');
const WEB_PORT = 4310;
const NEST_PORT = 4320;
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

interface ApiRootBoot {
  readonly bootstrapStartedAt: Date;
  readonly recoveryStartedAt: Date | null;
  readonly recoveryCompletedAt: Date | null;
  readonly recoveryInvocations: number;
  readonly acceptingRequestsAt: Date;
}

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
    private readonly approvalTransactions: AgentApprovalContinuationTransactionPort,
    private readonly attemptOperations: AgentAttemptOperationTransactionPort,
    private readonly transitions: AgentSessionTransitionTransactionPort,
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
    const attempt = await this.attemptOperations.findAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      operationRunId: delegated.operationsRunId,
    });
    if (!attempt) throw new Error('durable acceptance child attempt was not reserved');
    const activeAttempt = await this.attemptOperations.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: input.sessionId,
      executionId: delegated.childExecutionId,
      operationRunId: delegated.operationsRunId,
    });
    await this.attemptOperations.persistAttemptHandle({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: input.sessionId,
      executionId: delegated.childExecutionId,
      attemptId: activeAttempt.id,
      runtimeType: 'codex_cli',
      externalRunId: 'acceptance-external-child-run',
      encryptedHandleRef: 'vault://acceptance-child-handle',
      runtimeGeneration: 1,
    });
    await this.transitions.transitionTask({
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
    await this.transitions.transitionTask({
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
        throw new Error('durable active run did not reach the API stop boundary');
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
    const stale = await this.approvalTransactions.requestApproval({
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
    if (submitted.includes('API stop')) {
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

const deterministicRuntimeCleanup = async () => ({
  state: 'clean' as const,
  executionAuthority: 'irrevocably_revoked' as const,
  credentials: 'not_owned' as const,
  handle: 'removed' as const,
  filesystem: 'not_owned' as const,
});

/** Test-only durable runtime replacement; no local CLI, MCP child, or credentials are used. */
class DeterministicAcceptanceCliRuntime implements AgentDurableRuntimeAdapter {
  readonly runtimeType = 'codex_cli';
  readonly capabilities = {
    detached: true,
    reconnect: true,
    interrupt: true,
    cancel: true,
    inspect: true,
  };

  constructor(private readonly finishAfterApproval: () => void) {}

  async start(): Promise<never> { throw new Error('acceptance durable CLI runtime must reconnect'); }
  async *connect(): AsyncIterable<never> {}
  async inspect() { return { status: 'running' as const }; }
  async interrupt() { this.finishAfterApproval(); }
  async cancel() {}
  cleanup = deterministicRuntimeCleanup;
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
  prepareAcceptanceStandaloneWeb();
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
  const { app: nest, durableControls, deletionControl, boot } = await startApiRoot(prisma);
  const webLog: string[] = [];
  const web = startWeb(webLog);
  try {
    await waitForUrl(`http://127.0.0.1:${WEB_PORT}/login`);
    await waitForUrl(`http://127.0.0.1:${NEST_PORT}/api/auth/me`, {
      headers: { cookie: `kiditem_session=${PRIMARY_TOKEN}` },
    });
    await probeAcceptanceBoundaries();
  } catch (error) {
    await Promise.allSettled([
      stopTrackedChild(web),
      nest.close(),
      prisma.$disconnect(),
      postgres.stop(),
    ]);
    throw new Error(`acceptance setup failed: ${String(error)}; web=${JSON.stringify(webLog.slice(-30))}`);
  }

  return new AgentInteractionAcceptanceHarness(
    postgres, prisma, nest, web, webLog, durableControls, deletionControl, [boot],
  );
}

class AgentInteractionAcceptanceHarness {
  private selectedThreadId: string | null = null;

  constructor(
    private readonly postgres: StartedPostgreSqlContainer,
    private readonly prisma: PrismaClient,
    private nest: INestApplication,
    private readonly web: ChildProcess,
    private readonly webLog: string[],
  private durableControls: AcceptanceDurableControlPlane,
  private deletionControl: AgentSessionDeletionAcceptanceControl,
  private readonly apiRootBoots: ApiRootBoot[],
  ) {}

  diagnostics() {
    return { api: `http://127.0.0.1:${NEST_PORT}`, web: this.webLog.slice(-30) };
  }

  async authenticate(page: Page, identity: 'primary' | 'other-organization') {
    const token = identity === 'primary' ? PRIMARY_TOKEN : OTHER_TOKEN;
    await page.context().clearCookies();
    await page.context().addCookies([{ name: 'kiditem_session', value: token, url: `http://localhost:${WEB_PORT}` }]);
    await page.addInitScript(({ storageKey, value }) => {
      localStorage.setItem(storageKey, JSON.stringify(value));
      sessionStorage.setItem('kiditem.readiness.dismissed', '1');
    }, {
      storageKey: 'kiditem.auth.session.v1',
      value: { token, expiresAt: '2099-01-01T00:00:00.000Z' },
    });
  }

  async openPanel(page: Page, threadId?: string) {
    const dismissOnboarding = page.getByRole('button', { name: '오늘 하루 보지 않기' });
    if (await dismissOnboarding.count()) {
      await dismissOnboarding.click();
      await dismissOnboarding.waitFor({ state: 'hidden', timeout: 5_000 });
    }
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

    // Browser reconnect rebuilds its state from canonical rows while the
    // approval is still pending. API process-restart recovery is exercised by
    // the separate partial in-process run below, where it must terminalize
    // rather than resurrect this kind of local work.
    // Recreate only the browser-side Copilot transport. This is deliberately
    // still the same API boot: API-root recovery is covered by the separate
    // partial in-process run below. A fresh client transport must replay the
    // active run before the resumed durable child can publish its own run.
    await page.reload();
    await this.openPanel(page, threadId);
    const progress = page.getByTestId(`agent-task-${graph.taskId}`)
      .locator('[role="progressbar"][aria-valuenow="75"]');
    await progress.waitFor({ timeout: 10_000 }).catch(async (error) => {
      const directConnect = await this.readDirectConnectChunk(threadId);
      const browserConnect = await this.readBrowserConnectChunk(page, threadId);
      const rendered = await page.locator('[data-interaction-surface]').evaluateAll((surfaces) => (
        surfaces.map((surface) => ({
          threadId: surface.getAttribute('data-thread-id'),
          session: surface.getAttribute('data-session'),
          text: surface.textContent?.slice(0, 4_000) ?? '',
          activities: [...surface.querySelectorAll('[data-testid^="agent-task-"]')]
            .map((card) => card.getAttribute('data-testid')),
        }))
      )).catch(() => []);
      const replay = await this.prisma.agentConversationEvent.findMany({
        where: { sessionId: graph.sessionId },
        orderBy: { sequence: 'asc' },
        select: {
          id: true,
          sequence: true,
          eventType: true,
          payload: true,
          execution: { select: { aguiRunId: true } },
        },
      });
      throw new Error(`durable reconnect projection missing child progress directConnect=${JSON.stringify(directConnect)} browserConnect=${JSON.stringify(browserConnect)} rendered=${JSON.stringify(rendered)} replay=${JSON.stringify(
        replay.map((event) => ({
          id: event.id,
          sequence: event.sequence.toString(),
          eventType: event.eventType,
          aguiRunId: event.execution?.aguiRunId ?? null,
          payload: event.payload,
        })),
      )} :: ${String(error)}`);
    });
    if (await progress.getAttribute('aria-valuenow') !== '75') {
      throw new Error('progress produced after panel close was not replayed');
    }
    await page.getByLabel('Agent 위임').waitFor({ timeout: 10_000 });
    const approvalCard = page.getByLabel('Agent 승인 요청');
    await approvalCard.waitFor({ timeout: 10_000 }).catch(async (error) => {
      const [directConnect, browserConnect, rendered, replay] = await Promise.all([
        this.readDirectConnectChunk(threadId),
        this.readBrowserConnectChunk(page, threadId),
        page.locator('[data-interaction-surface]').evaluateAll((surfaces) => surfaces.map((surface) => ({
          threadId: surface.getAttribute('data-thread-id'),
          text: surface.textContent?.slice(0, 2_000) ?? '',
        }))).catch(() => []),
        this.prisma.agentConversationEvent.findMany({
          where: { sessionId: graph.sessionId }, orderBy: { sequence: 'asc' },
          select: { sequence: true, eventType: true, payload: true, execution: { select: { aguiRunId: true } } },
        }),
      ]);
      throw new Error(`durable approval interrupt missing directConnect=${JSON.stringify(directConnect)} browserConnect=${JSON.stringify(browserConnect)} rendered=${JSON.stringify(rendered)} replay=${JSON.stringify(replay.map((event) => ({ sequence: event.sequence.toString(), eventType: event.eventType, aguiRunId: event.execution?.aguiRunId ?? null, payload: event.payload }))) } :: ${String(error)}`);
    });
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

  async expectInProcessRunRecoveryAfterApiRestart(page: Page) {
    const before = await this.prisma.agentExecution.count();
    await page.goto('/dashboard');
    await this.openPanel(page);
    await page.getByRole('button', { name: '새 대화' }).click();
    const textbox = page.getByRole('textbox');
    await textbox.fill('API stop 검증');
    await textbox.press('Enter');
    await this.waitForExecutionCount(before + 1);
    await this.durableControls.waitForActiveStop();
    const active = this.durableControls.currentActiveStop();
    const beforeRestart = await this.prisma.agentExecution.findUniqueOrThrow({
      where: { id: active.executionId },
    });
    if (beforeRestart.status !== 'running') {
      throw new Error('API stop fixture was not canonically running before reconnect');
    }

    const recoveryBoot = await this.restartApiRoot();
    await this.waitForExecutionTerminal(active.executionId);
    const [recovered, attempt, terminalEvent, terminalEvents, terminalOutbox] = await Promise.all([
      this.prisma.agentExecution.findUniqueOrThrow({ where: { id: active.executionId } }),
      this.prisma.agentExecutionAttempt.findFirstOrThrow({
        where: { executionId: active.executionId, state: 'failed' },
      }),
      this.prisma.agentConversationEvent.findFirstOrThrow({
        where: { executionId: active.executionId, eventType: 'run_terminal', payload: { path: ['errorCode'], equals: 'process_interrupted' } },
        select: { externalEventId: true, createdAt: true, payload: true },
      }),
      this.prisma.agentConversationEvent.count({
        where: { executionId: active.executionId, eventType: 'run_terminal', payload: { path: ['errorCode'], equals: 'process_interrupted' } },
      }),
      this.prisma.agentConversationOutbox.count({
        where: { event: { executionId: active.executionId, eventType: 'run_terminal' } },
      }),
    ]);
    if (
      recovered.status !== 'failed' || recovered.errorCode !== 'process_interrupted'
      || attempt.errorCode !== 'process_interrupted' || terminalEvents !== 1 || terminalOutbox !== 1
      || terminalEvent.externalEventId !== `${active.executionId}:agui:process_interrupted`
      || recoveryBoot.recoveryInvocations !== 1
      || !recoveryBoot.recoveryStartedAt || !recoveryBoot.recoveryCompletedAt
      || recoveryBoot.recoveryCompletedAt > recoveryBoot.acceptingRequestsAt
      || terminalEvent.createdAt < recoveryBoot.recoveryStartedAt
      || terminalEvent.createdAt > recoveryBoot.recoveryCompletedAt
    ) {
      throw new Error(`API restart did not terminalize exactly one interrupted predecessor before request acceptance: ${JSON.stringify({ recovered, attempt, terminalEvent, terminalEvents, terminalOutbox, recoveryBoot })}`);
    }
    // A second real module bootstrap must observe the already-terminal
    // predecessor as a no-op. This is deliberately an API-root restart, not
    // a browser transport reconnect.
    const idempotentBoot = await this.restartApiRoot();
    const [attemptsAfterSecondBoot, terminalEventsAfterSecondBoot, terminalOutboxAfterSecondBoot] = await Promise.all([
      this.prisma.agentExecutionAttempt.count({ where: { executionId: active.executionId } }),
      this.prisma.agentConversationEvent.count({
        where: { executionId: active.executionId, eventType: 'run_terminal', payload: { path: ['errorCode'], equals: 'process_interrupted' } },
      }),
      this.prisma.agentConversationOutbox.count({
        where: { event: { executionId: active.executionId, eventType: 'run_terminal' } },
      }),
    ]);
    if (
      attemptsAfterSecondBoot !== 1 || terminalEventsAfterSecondBoot !== 1 || terminalOutboxAfterSecondBoot !== 1
      || idempotentBoot.recoveryInvocations !== 1
      || !idempotentBoot.recoveryCompletedAt
      || idempotentBoot.recoveryCompletedAt > idempotentBoot.acceptingRequestsAt
    ) {
      throw new Error(`repeated API bootstrap duplicated interrupted predecessor recovery or accepted requests before recovery completed: ${JSON.stringify({ attemptsAfterSecondBoot, terminalEventsAfterSecondBoot, terminalOutboxAfterSecondBoot, idempotentBoot })}`);
    }
    await page.reload();
    await this.openPanel(page, active.copilotThreadId);
    const response = await page.request.post(
      `http://127.0.0.1:${NEST_PORT}/api/copilotkit/agent/operator/stop/${encodeURIComponent(active.copilotThreadId)}`,
      { headers: { cookie: `kiditem_session=${PRIMARY_TOKEN}` } },
    );
    const responseBody = await response.text();
    let stopped: unknown = null;
    try { stopped = JSON.parse(responseBody).stopped; } catch {}
    if (!response.ok() || stopped !== false) {
      throw new Error(`API restart allowed the interrupted predecessor to stop/revive status=${response.status()} body=${responseBody.slice(0, 2_000)}`);
    }
    const beforeSuccessor = await this.prisma.agentExecution.count();
    await page.getByRole('button', { name: '새 대화' }).click();
    const successorThreadId = await this.submit(page, 'API restart 이후 새 실행');
    if (await this.prisma.agentExecution.count() !== beforeSuccessor + 1) {
      throw new Error('API restart successor was not created exactly once');
    }
    if (successorThreadId === active.copilotThreadId) {
      throw new Error('API restart successor reused the interrupted Copilot thread');
    }
    const successor = await this.prisma.agentExecution.findFirstOrThrow({
      where: { copilotThreadId: successorThreadId },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        aguiRunId: true,
        status: true,
        errorCode: true,
        startedAt: true,
        finishedAt: true,
        events: {
          where: { eventType: 'run_terminal' },
          select: { externalEventId: true, createdAt: true, payload: true },
        },
        attempts: {
          select: { id: true, state: true, errorCode: true, startedAt: true, finishedAt: true },
        },
      },
    });
    const successorTerminalOutbox = await this.prisma.agentConversationOutbox.count({
      where: { event: { executionId: successor.id, eventType: 'run_terminal' } },
    });
    const currentBoot = this.apiRootBoots.at(-1);
    if (
      // `completed` is the canonical AgentExecution success terminal (the
      // user-visible outcome is success; `succeeded` is used by a separate
      // OperationRun state machine and is not a valid AG-UI execution state).
      successor.status !== 'completed'
      || successor.aguiRunId === recovered.aguiRunId
      || !currentBoot
      || successor.startedAt < currentBoot.acceptingRequestsAt
      || successor.events.length !== 1
      || successor.events[0]?.externalEventId !== `${successor.id}:agui:5:RUN_FINISHED`
      || successorTerminalOutbox !== 1
      || successor.attempts.length !== 1
      || successor.attempts[0]?.state !== 'completed'
    ) {
      throw new Error(`API restart successor did not complete exactly one fresh terminal AG-UI run: ${JSON.stringify({ successor, successorTerminalOutbox, predecessorAguiRunId: recovered.aguiRunId, apiRootBoots: this.apiRootBoots })}`);
    }
  }

  async restartApiRoot(): Promise<ApiRootBoot> {
    // Deliberately tear down the actual API process root. This is not a
    // simulated controller or transport replacement: the second root runs its
    // own ApiApplicationModule bootstrap against the same disposable PG DB.
    // The partial AG-UI response intentionally remains open at this point;
    // sever its test-owned HTTP connection before awaiting Nest shutdown.
    // This mirrors a process exit while retaining an actual root close/create.
    (this.nest.getHttpServer() as { closeAllConnections?: () => void })
      .closeAllConnections?.();
    await this.nest.close();
    const restarted = await startApiRoot(this.prisma);
    this.nest = restarted.app;
    this.durableControls = restarted.durableControls;
    this.deletionControl = restarted.deletionControl;
    this.apiRootBoots.push(restarted.boot);
    await waitForUrl(`http://127.0.0.1:${NEST_PORT}/api/auth/me`, {
      headers: { cookie: `kiditem_session=${PRIMARY_TOKEN}` },
    });
    return restarted.boot;
  }

  async expectPanelReconnectWithoutWrites(page: Page, threadId: string) {
    const before = await this.counts();
    await page.reload();
    await this.openPanel(page, threadId);
    await this.expectReplayWithoutWrites(threadId);
    assertJson(await this.counts(), before, 'API reconnect replay wrote canonical rows');
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

  async expectSafeSourcingRenderer(page: Page) {
    await page.getByText('운영 지표').waitFor({ timeout: 10_000 });
    await page.getByText('품절 SKU', { exact: true }).waitFor({ timeout: 10_000 });
    // The disposable database contains no sourcing corpus.  Assert the real
    // bounded empty-evidence projection instead of inventing a citation.
    await page.getByText('검색 근거 없음').waitFor({ timeout: 10_000 });
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
    const response = await page.request.get(
      `http://127.0.0.1:${NEST_PORT}/api/copilotkit/agent/operator/connect/${encodeURIComponent(threadId)}`,
      { headers: { cookie: `kiditem_session=${OTHER_TOKEN}` } },
    );
    if (response.ok()) throw new Error('cross-organization session was available');
  }

  async expectCompleteDeletion(page: Page): Promise<void> {
    if (!this.selectedThreadId) throw new Error('missing selected session for deletion acceptance');
    const session = await this.session(this.selectedThreadId);
    await this.deletionControl.prepare(session.id);
    // Deletion shares the authenticated production API root with interaction;
    // only deterministic storage/runtime seams are overridden by this harness.
    const headers = { authorization: `Bearer ${PRIMARY_TOKEN}` };
    const route = `http://127.0.0.1:${NEST_PORT}/api/agent-os/sessions/${session.id}`;
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
      `http://127.0.0.1:${NEST_PORT}/api/copilotkit/bootstrap`,
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
    await stopTrackedChild(this.web);
    await Promise.allSettled([
      this.nest.close(),
      this.prisma.$disconnect(),
    ]);
    await this.postgres.stop();
  }

  private async readDirectConnectChunk(threadId: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await fetch(`http://127.0.0.1:${NEST_PORT}/api/copilotkit/agent/operator/connect`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          cookie: `kiditem_session=${PRIMARY_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          threadId,
          runId: randomUUID(),
          messages: [],
          tools: [],
          context: [],
          state: {},
          forwardedProps: {},
        }),
      });
      const result = await response.body?.getReader().read();
      return {
        status: response.status,
        contentType: response.headers.get('content-type'),
        done: result?.done ?? true,
        chunk: result?.value ? new TextDecoder().decode(result.value).slice(0, 8_000) : '',
      };
    } catch (fetchError) {
      return { error: String(fetchError) };
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  }

  /**
   * Distinguishes a same-origin proxy stream failure from a CopilotKit client
   * projection failure without changing the authenticated browser state.
   */
  private async readBrowserConnectChunk(page: Page, threadId: string) {
    return page.evaluate(async (requestedThreadId) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3_000);
      try {
        const response = await fetch('/api/copilotkit/agent/operator/connect', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            threadId: requestedThreadId,
            runId: crypto.randomUUID(),
            messages: [],
            tools: [],
            context: [],
            state: {},
            forwardedProps: {},
          }),
        });
        const details = {
          status: response.status,
          contentType: response.headers.get('content-type'),
          cacheControl: response.headers.get('cache-control'),
        };
        try {
          const result = await response.body?.getReader().read();
          return {
            ...details,
            done: result?.done ?? true,
            chunk: result?.value ? new TextDecoder().decode(result.value).slice(0, 8_000) : '',
          };
        } catch (readError) {
          return { ...details, error: String(readError) };
        }
      } catch (fetchError) {
        return { error: String(fetchError) };
      } finally {
        window.clearTimeout(timeout);
        controller.abort();
      }
    }, threadId).catch((error) => ({ error: String(error) }));
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

async function startApiRoot(prisma: PrismaClient): Promise<{
  app: INestApplication;
  deletionControl: AgentSessionDeletionAcceptanceControl;
  durableControls: AcceptanceDurableControlPlane;
  boot: ApiRootBoot;
}> {
  const bootstrapStartedAt = new Date();
  configureActualDeletionEnvironment();
  const storage = new DeterministicDeletionStorage();
  let durableControls: AcceptanceDurableControlPlane | null = null;
  const moduleRef = await Test.createTestingModule({
    imports: [ApiApplicationModule],
  })
    // The actual API composition remains in use. Only the external model
    // transport is replaced with the deterministic browser-runtime fixture.
    .overrideProvider(OpenAiResponsesAguiRuntimeAdapter)
    .useValue({ runtimeType: 'copilotkit_agui' })
    // This exact acceptance root replaces only the external CLI transport.
    // Durable control tests register the deterministic codex runtime below.
    .overrideProvider(LocalCliRuntimeStartupRegistrar)
    .useValue({ onApplicationBootstrap: async () => undefined })
    // Test-only deletion-result control. It intentionally does not implement
    // materializationCapability/openMultipart/upload methods, so this narrow
    // fake cannot claim Hermes production materialization support.
    .overrideProvider(AGENT_SESSION_ARTIFACT_STORAGE_PORT)
    .useValue(storage)
    .compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableCors({ origin: `http://localhost:${WEB_PORT}`, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.get(AgentRuntimeAdapterRegistry, { strict: false }).register(
    new DeterministicAcceptanceCliRuntime(() => durableControls?.finishAfterApproval()),
  );
  // The in-process AG-UI fixture has no external credential or process. Keep
  // that deletion seam explicit without introducing a second API application.
  app.get(AgentRuntimeAdapterRegistry, { strict: false }).registerCleanup({
    runtimeType: 'copilotkit_agui',
    cleanup: deterministicRuntimeCleanup,
  });
  // Instrument the real module provider before Nest invokes lifecycle hooks.
  // The timestamps make the E2E prove that recovery completed before this
  // root listened, rather than merely observing the recovered rows later.
  const recovery = app.get(AgentAguiStartupRecoveryService, { strict: false });
  const recoverInterruptedRuns = recovery.onApplicationBootstrap.bind(recovery);
  let recoveryStartedAt: Date | null = null;
  let recoveryCompletedAt: Date | null = null;
  let recoveryInvocations = 0;
  recovery.onApplicationBootstrap = async () => {
    recoveryInvocations += 1;
    recoveryStartedAt = new Date();
    await recoverInterruptedRuns();
    recoveryCompletedAt = new Date();
  };
  await app.listen(NEST_PORT, '127.0.0.1');
  const acceptingRequestsAt = new Date();

  const registry = app.get(OperationHandlerRegistryService, { strict: false });
  if (!registry.listDefinitions().some((definition) => definition.key === 'agent-os.delete-session')) {
    throw new Error('actual API root did not register the AgentSession deletion handler');
  }
  const worker = app.get(OperationRunWorkerService, { strict: false });
  const ownedOperations = app.get(AgentSessionOwnedOperationService, { strict: false });
  const approvalTransactions = app.get(AGENT_APPROVAL_CONTINUATION_TRANSACTION, { strict: false }) as AgentApprovalContinuationTransactionPort;
  const attemptOperations = app.get(AGENT_ATTEMPT_OPERATION_TRANSACTION, { strict: false }) as AgentAttemptOperationTransactionPort;
  const transitions = app.get(AGENT_SESSION_TRANSITION_TRANSACTION, { strict: false }) as AgentSessionTransitionTransactionPort;
  const runtimeControl = app.get(AgentSessionRuntimeControlService, { strict: false });
  const delegations = app.get(AgentSessionDelegationService, { strict: false });
  const approvals = app.get(AgentSessionApprovalService, { strict: false });
  const presentation = app.get(AgentInteractionPresentationService, { strict: false });
  const operationRepository = app.get(OperationRepositoryAdapter, { strict: false });
  durableControls = new AcceptanceDurableControlPlane(
    approvalTransactions,
    attemptOperations,
    transitions,
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
      if (!transitioned) throw new Error('durable acceptance operation did not enter approval boundary');
    },
  );
  const runtimeRegistry = app.get(AgentAguiRuntimeRegistry, { strict: false });
  runtimeRegistry.register('copilotkit_agui', new DeterministicAcceptanceRuntime(presentation, durableControls));
  return {
    app,
    durableControls,
    boot: {
      bootstrapStartedAt,
      recoveryStartedAt,
      recoveryCompletedAt,
      recoveryInvocations,
      acceptingRequestsAt,
    },
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
    OPERATION_RUNTIME_WORKER_ENABLED: '0',
    OPERATION_SCHEDULER_ENABLED: '0',
    AGENT_RUNTIME_WORKER_ENABLED: '0',
    AI_DIRECT_JOB_WORKER_ENABLED: '0',
  });
}

function startWeb(log: string[]): ChildProcess {
  const child = spawn(process.execPath, [path.join(repoRoot, 'apps/web/.next/standalone/apps/web/server.js')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOSTNAME: '127.0.0.1',
      PORT: String(WEB_PORT),
      NEXT_PUBLIC_API_URL: `http://127.0.0.1:${NEST_PORT}`,
      KIDITEM_PROXY_ALL_API: 'true',
    },
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
      KIDITEM_PROXY_ALL_API: 'true',
    },
    stdio: 'ignore',
  });
}

function prepareAcceptanceStandaloneWeb() {
  const webBuild = path.join(repoRoot, 'apps/web/.next');
  const standaloneBuild = path.join(webBuild, 'standalone/apps/web');
  cpSync(path.join(webBuild, 'static'), path.join(standaloneBuild, '.next/static'), {
    recursive: true,
  });
  const publicDirectory = path.join(repoRoot, 'apps/web/public');
  cpSync(publicDirectory, path.join(standaloneBuild, 'public'), {
    recursive: true,
    force: true,
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
      select: { id: true, runtimeType: true, capabilityKeys: true, policyDocument: true },
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
  const expectedOperatorCapabilities = [
    'agent_os.platform_probe',
    'analytics.readOverview',
    'sourcing.retrieveWorkspaceEvidence',
    'sourcing.inspectRecommendationRun',
  ];
  const operatorPolicies = operator.policyDocument && typeof operator.policyDocument === 'object'
    ? (operator.policyDocument as { toolPolicies?: unknown }).toolPolicies
    : undefined;
  const directlyAllowed = Array.isArray(operatorPolicies)
    ? operatorPolicies
      .filter((policy): policy is { toolKey: string; effect: string; approvalMode: string } =>
        Boolean(policy) && typeof policy === 'object' &&
        typeof (policy as { toolKey?: unknown }).toolKey === 'string' &&
        typeof (policy as { effect?: unknown }).effect === 'string' &&
        typeof (policy as { approvalMode?: unknown }).approvalMode === 'string',
      )
      .filter((policy) => policy.effect === 'allow' && policy.approvalMode === 'none')
      .map((policy) => policy.toolKey)
      .sort()
    : [];
  if (
    JSON.stringify(operator.capabilityKeys) !== JSON.stringify(expectedOperatorCapabilities) ||
    JSON.stringify(directlyAllowed) !== JSON.stringify([...expectedOperatorCapabilities].sort())
  ) {
    throw new Error(`official Operator seed lacks acceptance read capabilities: manifest=${JSON.stringify(operator.capabilityKeys)} direct=${JSON.stringify(directlyAllowed)}`);
  }
  AGENT_VERSION_ID = operator.id;
  DELEGATE_VERSION_ID = sourcing.id;
}

async function waitForUrl(url: string, init?: RequestInit) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(url, init).catch(() => null);
    if (response?.ok) return;
    await delay(250);
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function probeAcceptanceBoundaries() {
  const headers = { cookie: `kiditem_session=${PRIMARY_TOKEN}` };
  const probes = [
    fetch(`http://127.0.0.1:${NEST_PORT}/api/auth/me`, { headers }),
    fetch(`http://127.0.0.1:${NEST_PORT}/api/copilotkit/bootstrap`, { headers }),
    fetch(`http://127.0.0.1:${NEST_PORT}/api/copilotkit/info`, { headers }),
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
