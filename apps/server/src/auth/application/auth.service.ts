import { Inject, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import type { AuthUserPublic, LoginRequest, LoginResponse } from '@kiditem/shared/auth';
import type { AuthUser } from '../auth.types';
import {
  createAuthSessionToken,
  hashAuthPassword,
  hashAuthSessionToken,
  isAuthSessionToken,
  verifyAuthPassword,
} from '../domain/auth-credentials';
import {
  AUTH_REPOSITORY,
  type AuthIdentityRecord,
  type AuthRepository,
  type AuthUserRecord,
} from './port/out/repository/auth.repository.port';

export const AUTH_CLOCK = Symbol('AUTH_CLOCK');
export const AUTH_SESSION_COOKIE = 'kiditem_session';
export const AUTH_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1_000;

export interface AuthenticatedSession {
  sessionId: string;
  authUser: AuthUser;
}

@Injectable()
export class AuthService {
  private readonly now: () => Date;

  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
    @Optional() @Inject(AUTH_CLOCK) clock?: () => Date,
  ) {
    this.now = clock ?? (() => new Date());
  }

  async login(input: LoginRequest): Promise<LoginResponse> {
    const email = normalizeEmail(input.email);
    const user = await this.repository.findUserByEmail(email);
    const passwordMatches = await verifyAuthPassword(input.password, user?.passwordHash);
    if (!user || !user.isActive || !passwordMatches) {
      throw new UnauthorizedException('invalid_credentials');
    }

    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + AUTH_SESSION_DURATION_MS);
    const token = createAuthSessionToken();
    await this.repository.createSessionAndTouchLogin({
      userId: user.id,
      tokenHash: hashAuthSessionToken(token),
      createdAt,
      expiresAt,
    });

    return {
      session: { token, expiresAt: expiresAt.toISOString() },
      user: toAuthUserPublic(user),
    } satisfies LoginResponse;
  }

  async authenticateToken(token: string): Promise<AuthenticatedSession | null> {
    if (!isAuthSessionToken(token)) return null;
    const session = await this.repository.findSessionByTokenHash(hashAuthSessionToken(token));
    const now = this.now();
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= now.getTime() ||
      !session.user.isActive
    ) {
      return null;
    }
    return {
      sessionId: session.id,
      authUser: toAuthUser(session.user),
    };
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.repository.revokeSession(sessionId, userId, this.now());
  }

  async getCurrentUser(authUser: AuthUser): Promise<AuthUserPublic> {
    const user = await this.repository.findIdentityById(authUser.id);
    if (!user) throw new NotFoundException('user_not_found');
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      type: user.type,
      role: authUser.role,
      organizationId: authUser.organizationId,
      membershipId: authUser.membershipId,
    } satisfies AuthUserPublic;
  }

  async setPassword(email: string, password: string): Promise<void> {
    const passwordHash = await hashAuthPassword(password);
    const updated = await this.repository.setPasswordAndRevokeSessions(
      normalizeEmail(email),
      passwordHash,
      this.now(),
    );
    if (!updated) throw new NotFoundException('user_not_found');
  }

  async revokeAllSessions(email: string): Promise<void> {
    const updated = await this.repository.revokeAllSessionsByEmail(
      normalizeEmail(email),
      this.now(),
    );
    if (!updated) throw new NotFoundException('user_not_found');
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toAuthUser(user: AuthIdentityRecord): AuthUser {
  const membership = user.memberships[0] ?? null;
  return {
    id: user.id,
    email: user.email,
    type: user.type,
    role: membership?.role ?? user.role,
    organizationId: membership?.organizationId ?? null,
    membershipId: membership?.id ?? null,
  };
}

function toAuthUserPublic(user: AuthUserRecord): AuthUserPublic {
  return {
    ...toAuthUser(user),
    name: user.name,
  } satisfies AuthUserPublic;
}
