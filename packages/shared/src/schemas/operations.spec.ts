import { describe, expect, it } from 'vitest';
import {
  BrowserOperationReportRequestSchema,
  CreateOperationRunRequestSchema,
  OperationRunSchema,
  OperationStatusSchema,
  UpsertOperationScheduleRequestSchema,
} from './operations.js';

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
      }),
    ).toMatchObject({ status: 'queued' });
  });

  it('keeps a composite parent waiting for a child as a non-terminal state', () => {
    expect(OperationStatusSchema.parse('waiting_dependency')).toBe('waiting_dependency');
    expect(OperationStatusSchema.options).toContain('waiting_dependency');
  });
});
