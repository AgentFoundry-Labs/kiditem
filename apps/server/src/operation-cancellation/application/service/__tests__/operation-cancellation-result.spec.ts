import { describe, expect, it } from 'vitest';
import {
  agentCancellationWasApplied,
  buildCancelOperationResult,
  linkedAgentRequestsWarning,
  linkedAgentRunsWarning,
  linkedAgentCancellationWarnings,
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
        agentRunRequestIds: [],
        agentRunIds: [],
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

  it('turns linked Agent OS cancellation counts into response warnings', () => {
    expect(linkedAgentRequestsWarning(2)).toBe(
      'Linked Agent OS requests cancelled: 2',
    );
    expect(linkedAgentRunsWarning(1)).toBe('Linked Agent OS runs cancelled: 1');
    expect(
      linkedAgentCancellationWarnings({
        cancelledAgentRunRequests: 2,
        cancelledAgentRuns: 1,
      }),
    ).toEqual([
      'Linked Agent OS requests cancelled: 2',
      'Linked Agent OS runs cancelled: 1',
    ]);
  });

  it('treats either cancelled request or run count as an applied Agent OS cancellation', () => {
    expect(agentCancellationWasApplied(undefined)).toBe(false);
    expect(agentCancellationWasApplied({
      cancelledRequests: 0,
      cancelledRuns: 0,
    })).toBe(false);
    expect(agentCancellationWasApplied({
      cancelledRequests: 1,
      cancelledRuns: 0,
    })).toBe(true);
    expect(agentCancellationWasApplied({
      cancelledRequests: 0,
      cancelledRuns: 1,
    })).toBe(true);
  });
});
