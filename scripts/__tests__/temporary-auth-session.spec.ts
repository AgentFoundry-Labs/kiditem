import { describe, expect, it, vi } from 'vitest';

import {
  createTemporaryAuthSession,
  revokeTemporaryAuthSession,
} from '../_shared/temporary-auth-session';

describe('temporary auth session', () => {
  it('creates a short-lived hashed session for the exact active user', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'session-id' });
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-id',
          email: 'operator@example.com',
          isActive: true,
        }),
      },
      authSession: { create },
    };
    const now = new Date('2026-07-30T00:00:00.000Z');

    const session = await createTemporaryAuthSession(prisma as never, {
      userId: 'user-id',
      email: 'OPERATOR@example.com',
      lifetimeMs: 60_000,
      now,
    });

    expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.expiresAt.toISOString()).toBe('2026-07-30T00:01:00.000Z');
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        createdAt: now,
        expiresAt: session.expiresAt,
      },
      select: { id: true },
    });
    expect(create.mock.calls[0][0].data.tokenHash).not.toContain(session.token);
  });

  it('refuses an inactive or mismatched account', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-id',
          email: 'other@example.com',
          isActive: true,
        }),
      },
      authSession: { create: vi.fn() },
    };

    await expect(createTemporaryAuthSession(prisma as never, {
      userId: 'user-id',
      email: 'operator@example.com',
    })).rejects.toThrow(/does not match/i);
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it('revokes only a currently active session', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const revokedAt = new Date('2026-07-30T00:00:00.000Z');

    await revokeTemporaryAuthSession({ authSession: { updateMany } } as never, 'session-id', revokedAt);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'session-id', revokedAt: null },
      data: { revokedAt },
    });
  });
});
