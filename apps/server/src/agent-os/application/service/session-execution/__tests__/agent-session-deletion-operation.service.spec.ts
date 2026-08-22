import { describe, expect, it, vi } from 'vitest';
import { AgentSessionDeletionOperationService } from '../agent-session-deletion-operation.service';

const context = {
  signal: new AbortController().signal,
  organizationId: '00000000-0000-4000-8000-000000000001',
  runId: '00000000-0000-4000-8000-000000000002',
  attemptToken: 'token-1',
  attempts: 1,
  maxAttempts: 4,
  enterEphemeralFinalization: vi.fn(),
  input: {
    session: 'organizations/00000000-0000-4000-8000-000000000001/agentSessions/00000000-0000-4000-8000-000000000003',
    retryGeneration: 1,
  },
};

describe('AgentSessionDeletionOperationService', () => {
  it('uses the second persisted cumulative attempt delay for a successor run', async () => {
    const execution = {
      execute: vi.fn().mockResolvedValue({
        kind: 'retryable',
        code: 'STORAGE_DELETE_UNKNOWN',
        consumedAttempts: 2,
      }),
    };
    const service = new AgentSessionDeletionOperationService(
      execution as never,
      { markDeleteFailed: vi.fn() } as never,
      { purgeGraphDeletedLineage: vi.fn() } as never,
    );

    await expect(service.execute(context as never)).resolves.toMatchObject({
      kind: 'retryable',
      code: 'STORAGE_DELETE_UNKNOWN',
      retryAfterMs: 120_000,
    });
  });
});
