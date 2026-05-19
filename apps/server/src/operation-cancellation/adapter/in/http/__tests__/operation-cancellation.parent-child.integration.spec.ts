import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../../../../../agent-os/application/port/in/agent-runner.port';
import {
  AI_GENERATION_CANCELLATION_PORT,
  type AiGenerationCancellationPort,
} from '../../../../../ai/application/port/in/generation/ai-generation-cancellation.port';
import { AI_OPERATION_ALERT_PORT } from '../../../../../ai/application/port/out/cross-domain/operation-alert.port';
import { PRODUCT_GENERATION_CHILD_LEDGER_REPOSITORY_PORT } from '../../../../../ai/application/port/out/repository/product-generation-child-ledger.repository.port';
import { ProductGenerationAlertService } from '../../../../../ai/application/service/product-generation-alert.service';
import {
  OPERATION_ALERT_PORT,
  type OperationAlertPort,
  type OperationLifecyclePatch,
  type StartOperationAlertInput,
} from '../../../../../automation/application/port/in/operation-alert.port';
import type { AlertRecord } from '../../../../../automation/application/port/persistence-records';
import {
  WORKFLOW_RUN_CANCELLATION_PORT,
  type WorkflowRunCancellationPort,
} from '../../../../../automation/application/port/in/workflow-run-cancellation.port';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { OperationCancellationService } from '../../../../application/service/operation-cancellation.service';
import { OperationCancellationController } from '../operation-cancellation.controller';

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const OPERATION_KEY = 'product-generation:batch-1';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function alertFromStart(input: StartOperationAlertInput): AlertRecord {
  const now = new Date('2026-05-18T00:00:00.000Z');
  return {
    id: `alert:${input.operationKey}`,
    organizationId: input.organizationId,
    kind: 'operation',
    status: 'running',
    type: input.type,
    severity: input.severity ?? 'info',
    title: input.title,
    message: input.message ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    operationKey: input.operationKey,
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    actorUserId: input.actorUserId ?? null,
    actionTaskId: null,
    href: input.href,
    progress: input.progress ?? null,
    metadata: input.metadata ?? {},
    isRead: false,
    readAt: null,
    startedAt: now,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function applyPatch(
  alert: AlertRecord,
  patch: OperationLifecyclePatch | undefined,
  status: string,
): AlertRecord {
  return {
    ...alert,
    status,
    message: patch?.message ?? alert.message,
    href: patch && 'href' in patch ? patch.href ?? null : alert.href,
    progress:
      patch && 'progress' in patch ? patch.progress ?? null : alert.progress,
    severity: patch?.severity ?? alert.severity,
    metadata: {
      ...asRecord(alert.metadata),
      ...asRecord(patch?.metadata),
    },
    finishedAt:
      status === 'running'
        ? alert.finishedAt
        : new Date('2026-05-18T00:01:00.000Z'),
    updatedAt: new Date('2026-05-18T00:01:00.000Z'),
  };
}

function makeOperationAlerts() {
  const alerts = new Map<string, AlertRecord>();
  const keyFor = (organizationId: string, operationKey: string) =>
    `${organizationId}:${operationKey}`;

  const port = {
    start: vi.fn(async (input: StartOperationAlertInput) => {
      const alert = alertFromStart(input);
      alerts.set(keyFor(input.organizationId, input.operationKey), alert);
      return alert;
    }),
    findByOperationKey: vi.fn(
      async (organizationId: string, operationKey: string) => {
        return alerts.get(keyFor(organizationId, operationKey)) ?? null;
      },
    ),
    progress: vi.fn(
      async (
        organizationId: string,
        operationKey: string,
        patch: OperationLifecyclePatch,
      ) => {
        const existing = alerts.get(keyFor(organizationId, operationKey));
        if (!existing) return null;
        const updated = applyPatch(existing, patch, existing.status);
        alerts.set(keyFor(organizationId, operationKey), updated);
        return updated;
      },
    ),
    succeed: vi.fn(
      async (
        organizationId: string,
        operationKey: string,
        patch?: OperationLifecyclePatch,
      ) => {
        const existing = alerts.get(keyFor(organizationId, operationKey));
        if (!existing) return null;
        const updated = applyPatch(existing, patch, 'succeeded');
        alerts.set(keyFor(organizationId, operationKey), updated);
        return updated;
      },
    ),
    fail: vi.fn(
      async (
        organizationId: string,
        operationKey: string,
        patch?: OperationLifecyclePatch,
      ) => {
        const existing = alerts.get(keyFor(organizationId, operationKey));
        if (!existing) return null;
        const updated = applyPatch(existing, patch, 'failed');
        alerts.set(keyFor(organizationId, operationKey), updated);
        return updated;
      },
    ),
    cancel: vi.fn(
      async (
        organizationId: string,
        operationKey: string,
        patch?: OperationLifecyclePatch,
      ) => {
        const existing = alerts.get(keyFor(organizationId, operationKey));
        if (!existing) return null;
        const updated = applyPatch(existing, patch, 'cancelled');
        alerts.set(keyFor(organizationId, operationKey), updated);
        return updated;
      },
    ),
    closeStaleOperations: vi.fn(async () => []),
  } satisfies OperationAlertPort;

  return {
    port,
    getAlert: (organizationId: string, operationKey: string) =>
      alerts.get(keyFor(organizationId, operationKey)) ?? null,
  };
}

function makeAiCancellationPort(): AiGenerationCancellationPort {
  return {
    cancelContentGeneration: vi.fn(async (input) => ({
      status: 'cancelled',
      generationId: input.generationId,
      operationKey: `detail-page:${input.generationId}`,
      preserved: false,
    })),
    cancelThumbnailGeneration: vi.fn(async (input) => ({
      status: 'cancelled',
      generationId: input.generationId,
      operationKey: `thumbnail-edit:${input.generationId}`,
      preserved: false,
    })),
  };
}

async function buildHarness() {
  const operationAlerts = makeOperationAlerts();
  const ai = makeAiCancellationPort();
  const workflows: WorkflowRunCancellationPort = {
    cancelRun: vi.fn(),
  };
  const agentRunner: AgentRunnerPort = {
    runByType: vi.fn(),
  };
  const prisma = {
    contentGeneration: { findFirst: vi.fn() },
    thumbnailGeneration: { findFirst: vi.fn() },
  };
  const childLedger = {
    readChildStatuses: vi.fn(async () => ({
      detailPageStatus: null,
      thumbnailStatus: null,
    })),
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [OperationCancellationController],
    providers: [
      OperationCancellationService,
      ProductGenerationAlertService,
      { provide: PrismaService, useValue: prisma },
      { provide: AI_OPERATION_ALERT_PORT, useValue: operationAlerts.port },
      { provide: PRODUCT_GENERATION_CHILD_LEDGER_REPOSITORY_PORT, useValue: childLedger },
      { provide: OPERATION_ALERT_PORT, useValue: operationAlerts.port },
      { provide: WORKFLOW_RUN_CANCELLATION_PORT, useValue: workflows },
      { provide: AGENT_RUNNER_PORT, useValue: agentRunner },
      { provide: AI_GENERATION_CANCELLATION_PORT, useValue: ai },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.use(
    (
      req: Request & { authUser?: { id: string; organizationId: string } },
      _res: Response,
      next: NextFunction,
    ) => {
      req.authUser = { id: USER, organizationId: ORG };
      next();
    },
  );
  await app.init();

  return {
    app,
    ai,
    operationAlerts,
    parentAlerts: moduleRef.get(ProductGenerationAlertService),
  };
}

describe('operation cancellation parent/child integration', () => {
  let app: INestApplication | null = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  async function startParentWithChildren() {
    const harness = await buildHarness();
    app = harness.app;

    await harness.parentAlerts.start({
      organizationId: ORG,
      actorUserId: USER,
      batchId: 'batch-1',
      candidateId: 'candidate-1',
      productName: '테스트 상품',
      href: '/product-pipeline/collected-products/candidate-1',
    });
    await harness.parentAlerts.recordChildStarted({
      organizationId: ORG,
      parentOperationKey: OPERATION_KEY,
      childKind: 'detail_page',
      childId: 'cg-1',
    });
    await harness.parentAlerts.recordChildStarted({
      organizationId: ORG,
      parentOperationKey: OPERATION_KEY,
      childKind: 'thumbnail',
      childId: 'tg-1',
    });

    return harness;
  }

  it('cancels product-generation children recorded on the parent alert through the HTTP operation endpoint', async () => {
    const harness = await startParentWithChildren();

    const response = await request(harness.app.getHttpServer())
      .post('/api/operations/cancel')
      .send({
        targetType: 'operation_key',
        operationKey: OPERATION_KEY,
        reason: '사용자 요청',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      status: 'cancelled',
      operationKey: OPERATION_KEY,
      affected: {
        workflowRunIds: [],
        agentRunRequestIds: [],
        agentRunIds: [],
        contentGenerationIds: ['cg-1'],
        thumbnailGenerationIds: ['tg-1'],
      },
      preserved: {
        contentGenerationIds: [],
        thumbnailGenerationIds: [],
      },
    });
    expect(harness.ai.cancelContentGeneration).toHaveBeenCalledWith({
      organizationId: ORG,
      generationId: 'cg-1',
      actorUserId: USER,
      reason: '사용자 요청',
      notifyProductGenerationParent: false,
    });
    expect(harness.ai.cancelThumbnailGeneration).toHaveBeenCalledWith({
      organizationId: ORG,
      generationId: 'tg-1',
      actorUserId: USER,
      reason: '사용자 요청',
      notifyProductGenerationParent: false,
    });

    const cancelled = harness.operationAlerts.getAlert(ORG, OPERATION_KEY);
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.metadata).toEqual(
      expect.objectContaining({
        childIds: {
          detailPageGenerationId: 'cg-1',
          thumbnailGenerationId: 'tg-1',
        },
        cancel: expect.objectContaining({
          requestedByUserId: USER,
          reason: '사용자 요청',
          result: 'cancelled',
          target: {
            targetType: 'operation_key',
            operationKey: OPERATION_KEY,
          },
          affected: expect.objectContaining({
            contentGenerationIds: ['cg-1'],
            thumbnailGenerationIds: ['tg-1'],
          }),
          cancelledChildren: {
            contentGenerationIds: ['cg-1'],
            thumbnailGenerationIds: ['tg-1'],
          },
        }),
      }),
    );
  });

  it('keeps late child starts and finishes from reopening a cancelled parent operation', async () => {
    const harness = await startParentWithChildren();

    await request(harness.app.getHttpServer())
      .post('/api/operations/cancel')
      .send({
        targetType: 'operation_key',
        operationKey: OPERATION_KEY,
      })
      .expect(200);
    const progressCallsAfterCancel =
      harness.operationAlerts.port.progress.mock.calls.length;

    const lateStart = await harness.parentAlerts.recordChildStarted({
      organizationId: ORG,
      parentOperationKey: OPERATION_KEY,
      childKind: 'thumbnail',
      childId: 'tg-late',
    });
    const lateFinish = await harness.parentAlerts.markChildFinished({
      organizationId: ORG,
      parentOperationKey: OPERATION_KEY,
      childKind: 'thumbnail',
      status: 'succeeded',
      childId: 'tg-late',
    });

    expect(lateStart.status).toBe('parent_terminal');
    expect(lateFinish?.status).toBe('cancelled');
    expect(harness.operationAlerts.port.progress).toHaveBeenCalledTimes(
      progressCallsAfterCancel,
    );
    expect(harness.operationAlerts.port.succeed).not.toHaveBeenCalled();
    expect(harness.operationAlerts.port.fail).not.toHaveBeenCalled();
    expect(harness.operationAlerts.getAlert(ORG, OPERATION_KEY)?.metadata).toEqual(
      expect.objectContaining({
        childIds: {
          detailPageGenerationId: 'cg-1',
          thumbnailGenerationId: 'tg-1',
        },
      }),
    );
  });
});
