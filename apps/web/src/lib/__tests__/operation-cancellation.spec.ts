import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildCancelOperationBody,
  cancelOperation,
  getCancelOperationToastMessage,
} from '../operation-cancellation';
import { apiClient } from '../api-client';

const mockApiPost = vi.hoisted(() => vi.fn());

vi.mock('../api-client', () => ({
  apiClient: {
    post: mockApiPost,
  },
}));

describe('operation cancellation client', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
  });

  it('builds a backend body without organization scope', () => {
    expect(
      buildCancelOperationBody({
        targetType: 'workflow_run',
        runId: 'run-1',
        reason: '사용자 요청',
      }),
    ).toEqual({
      targetType: 'workflow_run',
      runId: 'run-1',
      reason: '사용자 요청',
    });
  });

  it('posts cancellation requests to the platform endpoint', async () => {
    mockApiPost.mockResolvedValueOnce({
      ok: true,
      status: 'cancelled',
      message: '중단 요청이 반영되었습니다.',
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
      warnings: [],
    });

    await cancelOperation({
      targetType: 'operation_key',
      operationKey: 'workflow:run-1',
      reason: '사용자 요청',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/api/operations/cancel', {
      targetType: 'operation_key',
      operationKey: 'workflow:run-1',
      reason: '사용자 요청',
    });
  });

  it('uses server messages but falls back for terminal no-op responses', () => {
    expect(
      getCancelOperationToastMessage({
        ok: true,
        status: 'already_terminal',
        message: '',
        operationKey: null,
        affected: {
          workflowRunIds: [],
          agentRunRequestIds: [],
          agentRunIds: [],
          contentGenerationIds: [],
          thumbnailGenerationIds: [],
        },
        preserved: {
          contentGenerationIds: ['generation-1'],
          thumbnailGenerationIds: [],
        },
        warnings: [],
      }),
    ).toBe('이미 종료된 작업이라 기존 결과를 유지했습니다.');
  });
});
