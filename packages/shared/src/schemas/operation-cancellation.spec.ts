import { describe, expect, it } from 'vitest';
import {
  CancelOperationResponseSchema,
  CancelOperationTargetSchema,
  emptyCancelOperationAffected,
  emptyCancelOperationPreserved,
} from './operation-cancellation';

describe('operation cancellation schemas', () => {
  it('accepts every platform cancellation target without organization scope', () => {
    const targets = [
      {
        targetType: 'operation_key',
        operationKey: 'workflow:run-1',
        reason: '사용자 요청',
      },
      {
        targetType: 'workflow_run',
        runId: 'run-1',
      },
      {
        targetType: 'agent_run_request',
        requestId: 'request-1',
      },
      {
        targetType: 'agent_run',
        runId: 'agent-run-1',
      },
      {
        targetType: 'content_generation',
        generationId: 'generation-1',
      },
      {
        targetType: 'thumbnail_generation',
        generationId: 'thumbnail-generation-1',
      },
    ] as const;

    for (const target of targets) {
      expect(CancelOperationTargetSchema.parse(target)).toEqual(target);
    }
  });

  it('rejects empty target identifiers and overlong operation keys', () => {
    const emptyIdentifierTargets = [
      {
        targetType: 'operation_key',
        operationKey: '',
      },
      {
        targetType: 'workflow_run',
        runId: '',
      },
      {
        targetType: 'agent_run_request',
        requestId: '',
      },
      {
        targetType: 'agent_run',
        runId: '',
      },
      {
        targetType: 'content_generation',
        generationId: '',
      },
      {
        targetType: 'thumbnail_generation',
        generationId: '',
      },
    ] as const;

    for (const target of emptyIdentifierTargets) {
      expect(() => CancelOperationTargetSchema.parse(target)).toThrow();
    }

    expect(() =>
      CancelOperationTargetSchema.parse({
        targetType: 'operation_key',
        operationKey: 'x'.repeat(201),
      }),
    ).toThrow();
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
          directAiJobIds: ['image-job-1'],
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
        directAiJobIds: ['image-job-1'],
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
      directAiJobIds: [],
    });
    expect(emptyCancelOperationPreserved()).toEqual({
      contentGenerationIds: [],
      thumbnailGenerationIds: [],
    });
  });
});
