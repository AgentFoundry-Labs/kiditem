import { describe, expect, it, vi } from 'vitest';
import {
  AgentSessionIdSchema,
  formatAgentSessionName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import type { AgentSessionDeletionPort } from '../../../port/in/session-control/agent-session-deletion.port';
import { AgentSessionDeletionService } from '../agent-session-deletion.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000010';
const SESSION_ID = '00000000-0000-4000-8000-000000000011';
const ACTOR_ID = '00000000-0000-4000-8000-000000000012';
const session = formatAgentSessionName(
  OrganizationIdSchema.parse(ORGANIZATION_ID),
  AgentSessionIdSchema.parse(SESSION_ID),
);

function creatorScope() {
  return { organizationId: ORGANIZATION_ID, actorUserId: ACTOR_ID, session };
}

describe('AgentSessionDeletionService', () => {
  it('starts a system-only generation-one deletion transaction from the canonical session name', async () => {
    const commands = { begin: vi.fn().mockResolvedValue({ state: 'deleting', failureCode: null }), retry: vi.fn() };
    const query = { findAuthorizedStatus: vi.fn() };
    const service: AgentSessionDeletionPort = new AgentSessionDeletionService(
      commands as never,
      query as never,
    );

    await expect(service.request(creatorScope())).resolves.toEqual({
      state: 'deleting', failureCode: null,
    });
    expect(commands.begin).toHaveBeenCalledWith(expect.objectContaining({
      ...creatorScope(),
      definition: expect.objectContaining({
        key: 'agent-os.delete-session',
        successPersistence: 'ephemeral_on_success',
        maxAttempts: 5,
      }),
      parsedInput: { session, retryGeneration: 1 },
      signal: expect.any(AbortSignal),
    }));
    expect(query.findAuthorizedStatus).not.toHaveBeenCalled();
  });

  it('replays finalizing only through an exact authorized post-graph binding', async () => {
    const commands = { begin: vi.fn().mockResolvedValue(null), retry: vi.fn() };
    const query = {
      findAuthorizedStatus: vi.fn()
        .mockResolvedValueOnce({ state: 'finalizing', failureCode: null })
        .mockResolvedValueOnce(null),
    };
    const service = new AgentSessionDeletionService(commands as never, query as never);

    await expect(service.request(creatorScope())).resolves.toEqual({
      state: 'finalizing', failureCode: null,
    });
    await expect(service.request({ ...creatorScope(), actorUserId: '00000000-0000-4000-8000-000000000013' }))
      .resolves.toBeNull();
    expect(query.findAuthorizedStatus).toHaveBeenNthCalledWith(1, creatorScope());
  });

  it('returns no deletion outcome for an unknown or cross-organization session', async () => {
    const commands = { begin: vi.fn().mockResolvedValue(null), retry: vi.fn().mockResolvedValue(null) };
    const query = { findAuthorizedStatus: vi.fn().mockResolvedValue(null) };
    const service = new AgentSessionDeletionService(commands as never, query as never);
    const foreign = {
      ...creatorScope(),
      organizationId: '00000000-0000-4000-8000-000000000014',
    };

    await expect(service.request(foreign)).resolves.toBeNull();
    await expect(service.status(foreign)).resolves.toBeNull();
    await expect(service.retry(foreign)).resolves.toBeNull();
  });
});
