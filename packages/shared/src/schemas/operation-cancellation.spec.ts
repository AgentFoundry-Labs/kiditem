import { describe, expect, it } from 'vitest';
import {
  CancelOperationResponseSchema,
  CancelOperationTargetSchema,
  emptyCancelOperationAffected,
  emptyCancelOperationPreserved,
} from './operation-cancellation';

describe('operation cancellation schemas', () => {
  it('accepts every platform cancellation target without organization scope', () => {
    expect(
      CancelOperationTargetSchema.parse({
        targetType: 'operation_key',
        operationKey: 'workflow:run-1',
        reason: '사용자 요청',
      }),
    ).toEqual({
      targetType: 'operation_key',
      operationKey: 'workflow:run-1',
      reason: '사용자 요청',
    });

    expect(
      CancelOperationTargetSchema.parse({
        targetType: 'agent_run_request',
        requestId: 'request-1',
      }),
    ).toEqual({
      targetType: 'agent_run_request',
      requestId: 'request-1',
    });
  });

  it('rejects a target with client-supplied organization scope', () => {
    expect(() =>
      CancelOperationTargetSchema.parse({
        targetType: 'workflow_run',
        runId: 'run-1',
        organizationId: 'org-1',
      }),
    ).toThrow();
  });

  it('keeps the response affected and preserved collections stable', () => {
    expect(
      CancelOperationResponseSchema.parse({
        ok: true,
        status: 'cancelled',
        message: '워크플로우 중단 요청이 반영되었습니다.',
        operationKey: 'workflow:run-1',
        affected: {
          workflowRunIds: ['run-1'],
          agentRunRequestIds: [],
          agentRunIds: [],
          contentGenerationIds: [],
          thumbnailGenerationIds: [],
        },
        preserved: {
          contentGenerationIds: [],
          thumbnailGenerationIds: [],
        },
        warnings: ['Linked Agent OS requests cancelled: 1'],
      }),
    ).toEqual({
      ok: true,
      status: 'cancelled',
      message: '워크플로우 중단 요청이 반영되었습니다.',
      operationKey: 'workflow:run-1',
      affected: {
        workflowRunIds: ['run-1'],
        agentRunRequestIds: [],
        agentRunIds: [],
        contentGenerationIds: [],
        thumbnailGenerationIds: [],
      },
      preserved: {
        contentGenerationIds: [],
        thumbnailGenerationIds: [],
      },
      warnings: ['Linked Agent OS requests cancelled: 1'],
    });
  });

  it('creates fresh empty result buckets for server mappers', () => {
    const affected = emptyCancelOperationAffected();
    affected.workflowRunIds.push('run-1');

    expect(emptyCancelOperationAffected()).toEqual({
      workflowRunIds: [],
      agentRunRequestIds: [],
      agentRunIds: [],
      contentGenerationIds: [],
      thumbnailGenerationIds: [],
    });
    expect(emptyCancelOperationPreserved()).toEqual({
      contentGenerationIds: [],
      thumbnailGenerationIds: [],
    });
  });
});
