import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  AuthRepository,
  AuthSessionRecord,
  AuthUserRecord,
  CreateAuthSessionInput,
} from '../../../application/port/out/repository/auth.repository.port';

const ACTIVE_MEMBERSHIP = {
  where: { status: 'active' },
  orderBy: [{ lastSelectedAt: 'desc' as const }, { joinedAt: 'asc' as const }],
  take: 1,
  select: { id: true, organizationId: true, role: true },
};

@Injectable()
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        type: true,
        isActive: true,
        passwordHash: true,
        memberships: ACTIVE_MEMBERSHIP,
      },
    });
  }

  async findIdentityById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        type: true,
        isActive: true,
        memberships: ACTIVE_MEMBERSHIP,
      },
    });
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null> {
    return this.prisma.authSession.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            type: true,
            isActive: true,
            memberships: ACTIVE_MEMBERSHIP,
          },
        },
      },
    });
  }

  async createSessionAndTouchLogin(input: CreateAuthSessionInput): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.authSession.create({ data: input }),
      this.prisma.user.update({
        where: { id: input.userId },
        data: { lastLoginAt: input.createdAt },
      }),
    ]);
  }

  async revokeSession(sessionId: string, userId: string, revokedAt: Date): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt },
    });
  }

  async setPasswordAndRevokeSessions(
    email: string,
    passwordHash: string,
    revokedAt: Date,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return false;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt },
      }),
    ]);
    return true;
  }

  async revokeAllSessionsByEmail(email: string, revokedAt: Date): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return false;
    await this.prisma.authSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt },
    });
    return true;
  }
}
