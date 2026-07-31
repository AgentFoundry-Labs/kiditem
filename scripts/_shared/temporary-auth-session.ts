import type { PrismaClient } from '@prisma/client';

import {
  createAuthSessionToken,
  hashAuthSessionToken,
} from '../../apps/server/src/auth/domain/auth-credentials';

const DEFAULT_SESSION_LIFETIME_MS = 15 * 60 * 1000;

type AuthSessionPrisma = Pick<PrismaClient, 'authSession' | 'user'>;

export interface TemporaryAuthSession {
  id: string;
  token: string;
  expiresAt: Date;
}

export async function createTemporaryAuthSession(
  prisma: AuthSessionPrisma,
  input: {
    userId: string;
    email: string;
    lifetimeMs?: number;
    now?: Date;
  },
): Promise<TemporaryAuthSession> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, isActive: true },
  });
  if (
    !user ||
    !user.isActive ||
    user.email.trim().toLowerCase() !== input.email.trim().toLowerCase()
  ) {
    throw new Error('Temporary auth session user does not match the active local account');
  }

  const lifetimeMs = input.lifetimeMs ?? DEFAULT_SESSION_LIFETIME_MS;
  if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs <= 0) {
    throw new RangeError('Temporary auth session lifetime must be a positive integer');
  }

  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + lifetimeMs);
  const token = createAuthSessionToken();
  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenHash: hashAuthSessionToken(token),
      createdAt: now,
      expiresAt,
    },
    select: { id: true },
  });
  return { id: session.id, token, expiresAt };
}

export async function revokeTemporaryAuthSession(
  prisma: Pick<PrismaClient, 'authSession'>,
  sessionId: string,
  revokedAt = new Date(),
): Promise<void> {
  await prisma.authSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt },
  });
}
