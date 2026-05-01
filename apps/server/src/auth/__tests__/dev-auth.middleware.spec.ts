import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DevAuthMiddleware } from '../middleware/dev-auth.middleware';
import type { PrismaService } from '../../prisma/prisma.service';

const TEST_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'test@kiditem.local',
  role: 'member',
  type: 'human',
  memberships: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      organizationId: '22222222-2222-4222-8222-222222222222',
      userId: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
      status: 'active',
      joinedAt: new Date('2026-01-01T00:00:00.000Z'),
      lastSelectedAt: null,
    },
  ],
};

const EXPECTED_AUTH_USER = {
  id: TEST_USER.id,
  organizationId: TEST_USER.memberships[0].organizationId,
  membershipId: TEST_USER.memberships[0].id,
  role: TEST_USER.memberships[0].role,
  type: TEST_USER.type,
  email: TEST_USER.email,
};

function expectedFindUserCall(organizationId?: string) {
  return {
    where: { id: TEST_USER.id },
    include: {
      memberships: {
        where: {
          status: 'active',
          ...(organizationId ? { organizationId } : {}),
        },
        orderBy: [{ lastSelectedAt: 'desc' }, { joinedAt: 'asc' }],
        take: 1,
      },
    },
  };
}

function makePrisma(findUnique: ReturnType<typeof vi.fn>): PrismaService {
  return { user: { findUnique } } as unknown as PrismaService;
}

describe('DevAuthMiddleware', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.ALLOW_DEV_AUTH_IN_PROD;
    delete process.env.DEV_DEFAULT_USER_ID;
    delete process.env.DEV_DEFAULT_ORGANIZATION_ID;
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in origEnv)) delete process.env[k];
    }
    Object.assign(process.env, origEnv);
  });

  it('constructor throws in production without escape hatch', () => {
    process.env.NODE_ENV = 'production';
    expect(() => new DevAuthMiddleware(makePrisma(vi.fn()))).toThrow(/forbidden in production/i);
  });

  it('constructor allows production when ALLOW_DEV_AUTH_IN_PROD=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEV_AUTH_IN_PROD = 'true';
    expect(() => new DevAuthMiddleware(makePrisma(vi.fn()))).not.toThrow();
  });

  it('attaches authUser when x-dev-user-id header resolves to a row', async () => {
    const findUnique = vi.fn().mockResolvedValue(TEST_USER);
    const mw = new DevAuthMiddleware(makePrisma(findUnique));
    const req = { headers: { 'x-dev-user-id': TEST_USER.id } } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);
    expect(findUnique).toHaveBeenCalledWith(expectedFindUserCall());
    expect(req.authUser).toEqual(EXPECTED_AUTH_USER);
    expect(next).toHaveBeenCalledOnce();
  });

  it('selects membership from x-dev-organization-id when present', async () => {
    const findUnique = vi.fn().mockResolvedValue(TEST_USER);
    const mw = new DevAuthMiddleware(makePrisma(findUnique));
    const req = {
      headers: {
        'x-dev-user-id': TEST_USER.id,
        'x-dev-organization-id': TEST_USER.memberships[0].organizationId,
      },
    } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);
    expect(findUnique).toHaveBeenCalledWith(
      expectedFindUserCall(TEST_USER.memberships[0].organizationId),
    );
    expect(req.authUser).toEqual(EXPECTED_AUTH_USER);
  });

  it('falls back to DEV_DEFAULT_USER_ID env when no header', async () => {
    process.env.DEV_DEFAULT_USER_ID = TEST_USER.id;
    const findUnique = vi.fn().mockResolvedValue(TEST_USER);
    const mw = new DevAuthMiddleware(makePrisma(findUnique));
    const req = { headers: {} } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);
    expect(findUnique).toHaveBeenCalledWith(expectedFindUserCall());
    expect(req.authUser).toEqual(EXPECTED_AUTH_USER);
  });

  it('attaches authUser without organization context when no active membership exists', async () => {
    const findUnique = vi.fn().mockResolvedValue({ ...TEST_USER, memberships: [] });
    const mw = new DevAuthMiddleware(makePrisma(findUnique));
    const req = { headers: { 'x-dev-user-id': TEST_USER.id } } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);
    expect(req.authUser).toEqual({
      id: TEST_USER.id,
      organizationId: null,
      membershipId: null,
      role: TEST_USER.role,
      type: TEST_USER.type,
      email: TEST_USER.email,
    });
  });

  it('does not set authUser when no header and no env', async () => {
    const findUnique = vi.fn();
    const mw = new DevAuthMiddleware(makePrisma(findUnique));
    const req = { headers: {} } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);
    expect(findUnique).not.toHaveBeenCalled();
    expect(req.authUser).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('does not set authUser when user row not found', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const mw = new DevAuthMiddleware(makePrisma(findUnique));
    const req = { headers: { 'x-dev-user-id': 'unknown-id' } } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);
    expect(req.authUser).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('does not throw on db error — logs and continues to next()', async () => {
    const findUnique = vi.fn().mockRejectedValue(new Error('DB down'));
    const mw = new DevAuthMiddleware(makePrisma(findUnique));
    const req = { headers: { 'x-dev-user-id': TEST_USER.id } } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);
    expect(req.authUser).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });
});
