import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DevAuthMiddleware } from '../middleware/dev-auth.middleware';
import type { PrismaService } from '../../prisma/prisma.service';

const TEST_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  companyId: '22222222-2222-4222-8222-222222222222',
  email: 'test@kiditem.local',
  role: 'owner',
  type: 'human',
};

function makePrisma(findUnique: ReturnType<typeof vi.fn>): PrismaService {
  return { user: { findUnique } } as unknown as PrismaService;
}

describe('DevAuthMiddleware', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.ALLOW_DEV_AUTH_IN_PROD;
    delete process.env.DEV_DEFAULT_USER_ID;
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
    expect(findUnique).toHaveBeenCalledWith({ where: { id: TEST_USER.id } });
    expect(req.authUser).toEqual(TEST_USER);
    expect(next).toHaveBeenCalledOnce();
  });

  it('falls back to DEV_DEFAULT_USER_ID env when no header', async () => {
    process.env.DEV_DEFAULT_USER_ID = TEST_USER.id;
    const findUnique = vi.fn().mockResolvedValue(TEST_USER);
    const mw = new DevAuthMiddleware(makePrisma(findUnique));
    const req = { headers: {} } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: TEST_USER.id } });
    expect(req.authUser).toEqual(TEST_USER);
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
