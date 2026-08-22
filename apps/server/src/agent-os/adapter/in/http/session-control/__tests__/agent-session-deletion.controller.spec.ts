import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import type { AuthUser } from '../../../../../auth/auth.types';
import { AgentOsRuntimeError } from '../../../../../domain/agent-os.errors';
import { AgentSessionDeletionController } from '../agent-session-deletion.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000010';
const SESSION_ID = '00000000-0000-4000-8000-000000000011';

function user(actor: string): AuthUser {
  return {
    id: `00000000-0000-4000-8000-0000000000${actor}`,
    organizationId: ORGANIZATION_ID,
    membershipId: `00000000-0000-4000-8000-0000000001${actor}`,
    role: actor === 'admin' ? 'admin' : 'member',
    type: 'human',
    email: `${actor}@test.local`,
  };
}

function response() {
  const status = vi.fn().mockReturnThis();
  return { status } as unknown as Response & { status: ReturnType<typeof vi.fn> };
}

async function invokeController(input: {
  actor: 'creator' | 'admin' | 'ordinary' | 'foreign';
  lifecycle: 'active' | 'deleting' | 'delete_failed' | 'finalizing' | 'absent';
  action: 'delete' | 'status' | 'retry';
}) {
  const deletion = {
    request: vi.fn(),
    status: vi.fn(),
    retry: vi.fn(),
  };
  const authorized = input.actor === 'creator' || input.actor === 'admin';
  const result = !authorized || input.lifecycle === 'absent'
    ? null
    : {
      state: input.action === 'delete' && input.lifecycle === 'active'
        ? 'deleting'
        : input.lifecycle,
      failureCode: null,
    };
  deletion.request.mockResolvedValue(result);
  deletion.status.mockResolvedValue(result);
  deletion.retry.mockImplementation(async () => {
    if (!authorized) return null;
    if (input.actor === 'creator' && input.lifecycle === 'delete_failed') {
      throw new ForbiddenException({ code: 'DELETION_RETRY_ADMIN_REQUIRED' });
    }
    if (input.lifecycle !== 'delete_failed') {
      throw new ConflictException({ code: 'DELETION_RETRY_STATE_INVALID' });
    }
    return { state: 'deleting', failureCode: null };
  });
  const controller = new AgentSessionDeletionController(deletion as never);
  const resultResponse = response();
  try {
    const body = input.action === 'delete'
      ? await controller.requestDelete(ORGANIZATION_ID, user(input.actor), SESSION_ID, resultResponse)
      : input.action === 'status'
        ? await controller.status(ORGANIZATION_ID, user(input.actor), SESSION_ID, resultResponse)
        : await controller.retry(ORGANIZATION_ID, user(input.actor), SESSION_ID, resultResponse);
    return { statusCode: resultResponse.status.mock.calls[0]?.[0], body };
  } catch (error) {
    if (!(error instanceof ForbiddenException || error instanceof ConflictException)) throw error;
    return { statusCode: error.getStatus(), body: error.getResponse() as { code?: string } };
  }
}

describe('AgentSessionDeletionController', () => {
  it.each([
    ['creator', 'active', 'delete', 202, 'deleting'],
    ['admin', 'active', 'delete', 202, 'deleting'],
    ['creator', 'deleting', 'delete', 202, 'deleting'],
    ['creator', 'delete_failed', 'delete', 202, 'delete_failed'],
    ['creator', 'finalizing', 'delete', 202, 'finalizing'],
    ['creator', 'finalizing', 'status', 200, 'finalizing'],
    ['creator', 'absent', 'status', 204, undefined],
    ['ordinary', 'active', 'delete', 204, undefined],
    ['creator', 'delete_failed', 'retry', 403, 'DELETION_RETRY_ADMIN_REQUIRED'],
    ['admin', 'delete_failed', 'retry', 202, 'deleting'],
    ['admin', 'deleting', 'retry', 409, 'DELETION_RETRY_STATE_INVALID'],
    ['creator', 'active', 'retry', 409, 'DELETION_RETRY_STATE_INVALID'],
    ['foreign', 'active', 'status', 204, undefined],
  ] as const)('%s %s %s', async (actor, lifecycle, action, status, body) => {
    const response = await invokeController({ actor, lifecycle, action });
    expect(response.statusCode).toBe(status);
    expect(response.body?.state ?? response.body?.code).toBe(body);
  });

  it('passes only canonical session scope derived from the path and authenticated actor', async () => {
    const deletion = { request: vi.fn().mockResolvedValue(null), status: vi.fn(), retry: vi.fn() };
    const controller = new AgentSessionDeletionController(deletion as never);
    const resultResponse = response();

    await controller.requestDelete(ORGANIZATION_ID, user('creator'), SESSION_ID, resultResponse);

    expect(deletion.request).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      actorUserId: user('creator').id,
      session: `organizations/${ORGANIZATION_ID}/agentSessions/${SESSION_ID}`,
    });
  });

  it('maps the retry policy denial to a forbidden HTTP response', async () => {
    const deletion = {
      request: vi.fn(),
      status: vi.fn(),
      retry: vi.fn().mockRejectedValue(new AgentOsRuntimeError(
        'DELETION_RETRY_ADMIN_REQUIRED',
        'Only an organization owner or administrator can retry session deletion.',
      )),
    };
    const controller = new AgentSessionDeletionController(deletion as never);

    await expect(controller.retry(ORGANIZATION_ID, user('creator'), SESSION_ID, response()))
      .rejects.toMatchObject({
        status: 403,
        response: { code: 'DELETION_RETRY_ADMIN_REQUIRED' },
      });
  });
});
