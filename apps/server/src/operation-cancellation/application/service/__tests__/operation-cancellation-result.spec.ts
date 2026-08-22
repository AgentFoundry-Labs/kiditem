import { describe, expect, it } from 'vitest';
import {
  buildCancelOperationResult,
} from '../operation-cancellation-result';

describe('operation cancellation result policy', () => {
  it('builds a complete response with fresh empty buckets by default', () => {
    const first = buildCancelOperationResult({
      status: 'already_terminal',
      message: '이미 완료되었거나 중단된 작업입니다.',
      operationKey: 'operation:1',
    });
    first.affected.workflowRunIds.push('run-1');

    expect(buildCancelOperationResult({
      status: 'already_terminal',
      message: '이미 완료되었거나 중단된 작업입니다.',
      operationKey: 'operation:1',
    })).toEqual({
      ok: true,
      status: 'already_terminal',
      message: '이미 완료되었거나 중단된 작업입니다.',
      operationKey: 'operation:1',
      affected: {
        workflowRunIds: [],
        agentSessionTaskNames: [],
        contentGenerationIds: [],
        thumbnailGenerationIds: [],
        directAiJobIds: [],
      },
      preserved: {
        contentGenerationIds: [],
        thumbnailGenerationIds: [],
      },
      warnings: [],
    });
  });

});
