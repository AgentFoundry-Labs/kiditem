import { describe, expect, it } from 'vitest';
import {
  BrowserOperationClaimSchema,
  BrowserOperationHeartbeatRequestSchema,
  BrowserOperationReportRequestSchema,
  CreateOperationRunRequestSchema,
  MAX_OPERATION_PERSISTED_INT,
  OperationCatalogResponseSchema,
  OperationRunSchema,
  OperationStatusSchema,
  UpsertOperationScheduleRequestSchema,
} from './operations.js';

const validRun = {
  id: '4f519a8e-54cf-4ced-9e4e-d94d61cb8136',
  operationKey: 'sourcing.collect_daily_trends',
  definitionVersion: 1,
  title: '일일 트렌드 수집',
  ownerDomain: 'sourcing',
  engineType: 'composite',
  status: 'queued',
  triggerSource: 'dashboard',
  parentRunId: null,
  scheduleId: null,
  nativeRunType: null,
  nativeRunId: null,
  progress: null,
  result: null,
  error: null,
  requestedBy: null,
  scheduledFor: null,
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
} as const;

const persistedRun = {
  ...validRun,
  resourceClass: 'playwright_1688',
  executionTimeoutMs: 900_000,
  stage: null,
  stageUpdatedAt: null,
  progressCurrent: null,
  progressTotal: null,
  deadlineAt: null,
} as const;

describe('Operation wire contracts', () => {
  it('rejects tenant input and requires browser fencing', () => {
    expect(() =>
      CreateOperationRunRequestSchema.parse({
        sourceSurface: 'dashboard',
        organizationId: 'forbidden',
        input: {},
      }),
    ).toThrow();

    expect(() =>
      BrowserOperationReportRequestSchema.parse({
        status: 'running',
        progress: 0.5,
      }),
    ).toThrow();
  });

  it('keeps schedules disabled until an operator explicitly enables one', () => {
    expect(
      UpsertOperationScheduleRequestSchema.parse({
        cronExpression: '0 6 * * *',
        timeZone: 'Asia/Seoul',
        misfirePolicy: 'catch_up_once',
        enabled: false,
      }),
    ).toMatchObject({ input: {}, enabled: false });
  });

  it('accepts an organization-safe operation projection', () => {
    expect(
      OperationRunSchema.parse({
        ...validRun,
        resourceClass: 'default',
        executionTimeoutMs: 900_000,
        stage: null,
        stageUpdatedAt: null,
        progressCurrent: null,
        progressTotal: null,
        deadlineAt: null,
      }),
    ).toMatchObject({ status: 'queued' });
  });

  it('keeps a composite parent waiting for a child as a non-terminal state', () => {
    expect(OperationStatusSchema.parse('waiting_dependency')).toBe('waiting_dependency');
    expect(OperationStatusSchema.options).toContain('waiting_dependency');
  });

  it('keeps the exact pre-KID-24 status vocabulary', () => {
    expect(OperationStatusSchema.options).toEqual([
      'queued',
      'waiting_runtime',
      'waiting_dependency',
      'running',
      'attention_required',
      'succeeded',
      'failed',
      'cancelled',
      'skipped',
    ]);
  });

  it('rejects partial as an operation status', () => {
    expect(OperationStatusSchema.safeParse('partial').success).toBe(false);
    expect(OperationStatusSchema.options).not.toContain('partial');
  });

  it('rejects no_change as an operation status', () => {
    expect(OperationStatusSchema.safeParse('no_change').success).toBe(false);
    expect(OperationStatusSchema.options).not.toContain('no_change');
  });

  it('parses resource, deadline, stage, and count metadata together', () => {
    expect(
      OperationRunSchema.parse({
        ...persistedRun,
        stage: 'collecting_keyword',
        stageUpdatedAt: '2026-08-13T01:02:03.000Z',
        progressCurrent: 11,
        progressTotal: 12,
        deadlineAt: '2026-08-13T01:17:03.000Z',
      }).progressCurrent,
    ).toBe(11);
  });

  it('rejects an unknown operation resource class', () => {
    expect(() =>
      OperationRunSchema.parse({
        ...persistedRun,
        resourceClass: 'unknown',
      }),
    ).toThrow();
  });

  it('rejects a stage outside the safe code-value vocabulary', () => {
    expect(() =>
      OperationRunSchema.parse({
        ...persistedRun,
        stage: 'Collecting Keyword',
        stageUpdatedAt: '2026-08-13T01:02:03.000Z',
      }),
    ).toThrow();
  });

  it('rejects progress current above total', () => {
    expect(() =>
      OperationRunSchema.parse({
        ...persistedRun,
        progressCurrent: 13,
        progressTotal: 12,
      }),
    ).toThrow();
  });

  it('rejects negative progress current', () => {
    expect(() =>
      OperationRunSchema.parse({
        ...persistedRun,
        progressCurrent: -1,
        progressTotal: 12,
      }),
    ).toThrow();
  });

  it('rejects negative progress total', () => {
    const parsed = OperationRunSchema.safeParse({
      ...persistedRun,
      progressCurrent: 0,
      progressTotal: -1,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'too_small',
            path: ['progressTotal'],
          }),
        ]),
      );
    }
  });

  it('accepts the persisted signed-32-bit maximum for timeout and counts', () => {
    expect(
      OperationRunSchema.parse({
        ...persistedRun,
        executionTimeoutMs: MAX_OPERATION_PERSISTED_INT,
        progressCurrent: MAX_OPERATION_PERSISTED_INT,
        progressTotal: MAX_OPERATION_PERSISTED_INT,
      }),
    ).toMatchObject({
      executionTimeoutMs: MAX_OPERATION_PERSISTED_INT,
      progressCurrent: MAX_OPERATION_PERSISTED_INT,
      progressTotal: MAX_OPERATION_PERSISTED_INT,
    });

    expect(
      BrowserOperationHeartbeatRequestSchema.parse({
        attemptToken: '6fb6fd5f-5100-42dd-8680-0c218231be4e',
        progressCurrent: MAX_OPERATION_PERSISTED_INT,
        progressTotal: MAX_OPERATION_PERSISTED_INT,
      }),
    ).toMatchObject({ progressTotal: MAX_OPERATION_PERSISTED_INT });
  });

  it('rejects a persisted timeout above the signed-32-bit maximum', () => {
    expect(() =>
      OperationRunSchema.parse({
        ...persistedRun,
        executionTimeoutMs: MAX_OPERATION_PERSISTED_INT + 1,
      }),
    ).toThrow();

    expect(() =>
      OperationCatalogResponseSchema.parse({
        items: [
          {
            key: 'sourcing.collect_daily_trends',
            version: 1,
            title: '일일 트렌드 수집',
            ownerDomain: 'sourcing',
            engineType: 'composite',
            scheduleSupported: true,
            resourceClass: 'default',
            executionTimeoutMs: MAX_OPERATION_PERSISTED_INT + 1,
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects persisted counts above the signed-32-bit maximum', () => {
    expect(() =>
      OperationRunSchema.parse({
        ...persistedRun,
        progressCurrent: MAX_OPERATION_PERSISTED_INT + 1,
        progressTotal: MAX_OPERATION_PERSISTED_INT + 1,
      }),
    ).toThrow();
  });

  it('rejects browser counts above the signed-32-bit maximum', () => {
    const progressCurrent = MAX_OPERATION_PERSISTED_INT + 1;
    const progressTotal = MAX_OPERATION_PERSISTED_INT + 1;

    expect(() =>
      BrowserOperationHeartbeatRequestSchema.parse({
        attemptToken: '6fb6fd5f-5100-42dd-8680-0c218231be4e',
        progressCurrent,
        progressTotal,
      }),
    ).toThrow();
    expect(() =>
      BrowserOperationReportRequestSchema.parse({
        attemptToken: '6fb6fd5f-5100-42dd-8680-0c218231be4e',
        status: 'running',
        progressCurrent,
        progressTotal,
      }),
    ).toThrow();
  });

  it('publishes resource policy in the operation catalog', () => {
    expect(
      OperationCatalogResponseSchema.parse({
        items: [
          {
            key: 'sourcing.collect_daily_trends',
            version: 1,
            title: '일일 트렌드 수집',
            ownerDomain: 'sourcing',
            engineType: 'composite',
            scheduleSupported: true,
            resourceClass: 'default',
            executionTimeoutMs: 900_000,
          },
        ],
      }).items[0],
    ).toMatchObject({ resourceClass: 'default', executionTimeoutMs: 900_000 });
  });

  it('carries deadline, stage, and paired counts through browser runtime contracts', () => {
    expect(
      BrowserOperationClaimSchema.parse({
        runId: '4f519a8e-54cf-4ced-9e4e-d94d61cb8136',
        operationKey: 'sourcing.search_1688_keyword_batch',
        attemptToken: '6fb6fd5f-5100-42dd-8680-0c218231be4e',
        attempt: 1,
        input: { keyword: '아동 가방' },
        leaseExpiresAt: '2026-08-13T01:03:03.000Z',
        deadlineAt: '2026-08-13T01:17:03.000Z',
      }).deadlineAt,
    ).toBe('2026-08-13T01:17:03.000Z');

    expect(
      BrowserOperationHeartbeatRequestSchema.parse({
        attemptToken: '6fb6fd5f-5100-42dd-8680-0c218231be4e',
        stage: 'collecting_keyword',
        progressCurrent: 11,
        progressTotal: 12,
      }),
    ).toMatchObject({ stage: 'collecting_keyword', progressCurrent: 11 });
    expect(
      BrowserOperationHeartbeatRequestSchema.parse({
        attemptToken: '6fb6fd5f-5100-42dd-8680-0c218231be4e',
        progressCurrent: null,
        progressTotal: null,
      }),
    ).toMatchObject({ progressCurrent: null, progressTotal: null });
    expect(
      BrowserOperationReportRequestSchema.parse({
        attemptToken: '6fb6fd5f-5100-42dd-8680-0c218231be4e',
        status: 'succeeded',
        stage: 'completed',
        progressCurrent: 12,
        progressTotal: 12,
        result: { outcome: 'partial', imported: 11 },
      }).result,
    ).toEqual({ outcome: 'partial', imported: 11 });
    expect(() =>
      BrowserOperationReportRequestSchema.parse({
        attemptToken: '6fb6fd5f-5100-42dd-8680-0c218231be4e',
        status: 'succeeded',
        result: { raw_payload: 'unsafe' },
      }),
    ).toThrow();
  });

  it('rejects browser progress current without total', () => {
    expect(() =>
      BrowserOperationHeartbeatRequestSchema.parse({
        attemptToken: '6fb6fd5f-5100-42dd-8680-0c218231be4e',
        progressCurrent: 11,
      }),
    ).toThrow();
  });

  it('rejects browser progress total without current', () => {
    expect(() =>
      BrowserOperationHeartbeatRequestSchema.parse({
        attemptToken: '6fb6fd5f-5100-42dd-8680-0c218231be4e',
        progressTotal: 12,
      }),
    ).toThrow();
  });
});
