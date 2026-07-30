import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashAuthPassword, hashAuthSessionToken } from '../domain/auth-credentials';
import { AuthService } from './auth.service';
import type { AuthRepository, AuthUserRecord } from './port/out/repository/auth.repository.port';

const USER: AuthUserRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'operator@example.com',
  name: 'Office Operator',
  role: 'member',
  type: 'human',
  isActive: true,
  passwordHash: null,
  memberships: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      organizationId: '22222222-2222-4222-8222-222222222222',
      role: 'owner',
    },
  ],
};

function makeRepository(): AuthRepository {
  return {
    findUserByEmail: vi.fn(),
    findIdentityById: vi.fn(),
    findSessionByTokenHash: vi.fn(),
    createSessionAndTouchLogin: vi.fn(),
    revokeSession: vi.fn(),
    setPasswordAndRevokeSessions: vi.fn(),
    revokeAllSessionsByEmail: vi.fn(),
  };
}

describe('AuthService', () => {
  const now = new Date('2026-07-30T03:00:00.000Z');
  let repository: AuthRepository;
  let service: AuthService;

  beforeEach(() => {
    repository = makeRepository();
    service = new AuthService(repository, () => now);
  });

  it('normalizes email and creates an independent 30-day session', async () => {
    const passwordHash = await hashAuthPassword('correct horse battery staple');
    vi.mocked(repository.findUserByEmail).mockResolvedValue({ ...USER, passwordHash });
    vi.mocked(repository.createSessionAndTouchLogin).mockResolvedValue(undefined);

    const result = await service.login({
      email: '  OPERATOR@Example.com ',
      password: 'correct horse battery staple',
    });

    expect(repository.findUserByEmail).toHaveBeenCalledWith('operator@example.com');
    expect(repository.createSessionAndTouchLogin).toHaveBeenCalledWith({
      userId: USER.id,
      tokenHash: hashAuthSessionToken(result.session.token),
      createdAt: now,
      expiresAt: new Date('2026-08-29T03:00:00.000Z'),
    });
    expect(result.user).toMatchObject({
      id: USER.id,
      organizationId: USER.memberships[0].organizationId,
      membershipId: USER.memberships[0].id,
      role: 'owner',
    });
  });

  it.each([
    ['unknown user', null],
    ['inactive user', { ...USER, isActive: false }],
    ['missing password hash', USER],
  ])('returns the same invalid_credentials error for %s', async (_label, user) => {
    vi.mocked(repository.findUserByEmail).mockResolvedValue(user);

    await expect(
      service.login({ email: 'operator@example.com', password: 'wrong password' }),
    ).rejects.toMatchObject<Partial<UnauthorizedException>>({ message: 'invalid_credentials' });
    expect(repository.createSessionAndTouchLogin).not.toHaveBeenCalled();
  });

  it('authenticates an unrevoked, unexpired session and preserves membership ordering', async () => {
    const token = 'a'.repeat(43);
    vi.mocked(repository.findSessionByTokenHash).mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      revokedAt: null,
      user: USER,
    });

    await expect(service.authenticateToken(token)).resolves.toEqual({
      sessionId: '44444444-4444-4444-8444-444444444444',
      authUser: {
        id: USER.id,
        email: USER.email,
        type: USER.type,
        role: 'owner',
        organizationId: USER.memberships[0].organizationId,
        membershipId: USER.memberships[0].id,
      },
    });
    expect(repository.findSessionByTokenHash).toHaveBeenCalledWith(
      hashAuthSessionToken(token),
    );
  });

  it.each([
    ['expired', new Date('2026-07-30T02:59:59.999Z'), null, true],
    ['revoked', new Date('2026-08-01T00:00:00.000Z'), now, true],
    ['inactive user', new Date('2026-08-01T00:00:00.000Z'), null, false],
  ])('rejects an %s session', async (_label, expiresAt, revokedAt, isActive) => {
    vi.mocked(repository.findSessionByTokenHash).mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      expiresAt,
      revokedAt,
      user: { ...USER, isActive },
    });

    await expect(service.authenticateToken('a'.repeat(43))).resolves.toBeNull();
  });

  it('revokes only the current authenticated session on logout', async () => {
    await service.logout('session-id', USER.id);
    expect(repository.revokeSession).toHaveBeenCalledWith('session-id', USER.id, now);
  });

  it('returns the current public identity with the authenticated organization context', async () => {
    vi.mocked(repository.findIdentityById).mockResolvedValue(USER);

    await expect(service.getCurrentUser({
      id: USER.id,
      email: USER.email,
      type: USER.type,
      role: 'owner',
      organizationId: USER.memberships[0].organizationId,
      membershipId: USER.memberships[0].id,
    })).resolves.toEqual({
      id: USER.id,
      email: USER.email,
      name: USER.name,
      type: USER.type,
      role: 'owner',
      organizationId: USER.memberships[0].organizationId,
      membershipId: USER.memberships[0].id,
    });
  });
});
