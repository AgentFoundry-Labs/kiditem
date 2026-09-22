import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootstrapLocalAuthUser,
  buildLocalAuthBootstrapPlan,
  parseLocalAuthBootstrapArgs,
  readSinglePasswordLine,
} from '../bootstrap-local-auth-user';
import { assertLocalDevelopmentDatabase } from '../_shared/local-development-database';

const { ensureFormula } = vi.hoisted(() => ({ ensureFormula: vi.fn() }));
vi.mock('../data-migrations/ensure/absolute-product-abc-formula', () => ({
  ensureAbsoluteProductAbcFormulaForOrganization: ensureFormula,
}));

beforeEach(() => {
  ensureFormula.mockReset();
});

describe('local authentication identity bootstrap', () => {
  it('accepts only loopback non-production databases', () => {
    expect(() => assertLocalDevelopmentDatabase(
      'postgresql://kiditem:kiditem@localhost:5433/kiditem',
    )).not.toThrow();
    expect(() => assertLocalDevelopmentDatabase(
      'postgresql://kiditem:kiditem@127.0.0.1:5433/kiditem_dev',
    )).not.toThrow();
    expect(() => assertLocalDevelopmentDatabase(
      'postgresql://kiditem:kiditem@db.internal/kiditem',
    )).toThrow(/non-local/i);
    expect(() => assertLocalDevelopmentDatabase(
      'postgresql://kiditem:kiditem@localhost:5433/kiditem_staging',
    )).toThrow(/non-local/i);
  });

  it('normalizes the explicit identity and forbids password argv', () => {
    expect(parseLocalAuthBootstrapArgs([
      '--email', ' Dev@Example.COM ',
      '--name', 'Dev User',
      '--organization-name', 'KidItem Dev',
      '--password-stdin',
    ])).toEqual({
      email: 'dev@example.com',
      name: 'Dev User',
      organizationName: 'KidItem Dev',
      organizationSlug: 'kiditem-dev',
    });

    expect(() => parseLocalAuthBootstrapArgs([
      '--email', 'dev@example.com', '--name', 'Dev',
      '--organization-name', 'KidItem Dev', '--password', 'secret',
    ])).toThrow(/password.*argv/i);
    expect(() => parseLocalAuthBootstrapArgs([
      '--email', 'dev@example.com', '--name', 'Dev', '--password-stdin',
    ])).toThrow(/organization-name/i);
  });

  it('accepts exactly one non-empty stdin password line', () => {
    expect(readSinglePasswordLine('secret\n')).toBe('secret');
    expect(readSinglePasswordLine('secret\r\n')).toBe('secret');
    expect(() => readSinglePasswordLine('')).toThrow(/one non-empty line/i);
    expect(() => readSinglePasswordLine('first\nsecond\n')).toThrow(/one non-empty line/i);
  });

  it('builds one active admin identity plan without a session', () => {
    expect(buildLocalAuthBootstrapPlan({
      email: 'dev@example.com',
      name: 'Dev User',
      organizationName: 'KidItem Dev',
      organizationSlug: 'kiditem-dev',
    }, 'scrypt$hash', new Date('2026-08-29T00:00:00.000Z'))).toEqual({
      organization: { name: 'KidItem Dev', slug: 'kiditem-dev', isActive: true },
      user: {
        email: 'dev@example.com', name: 'Dev User', passwordHash: 'scrypt$hash',
        role: 'admin', type: 'human', isActive: true,
      },
      membership: {
        role: 'admin', status: 'active', lastSelectedAt: new Date('2026-08-29T00:00:00.000Z'),
      },
    });
  });

  it('upserts organization, user, membership, installs the ABC formula and revokes old sessions atomically', async () => {
    const organization = { id: 'organization-1' };
    const user = { id: 'user-1' };
    const tx = {
      organization: { upsert: vi.fn().mockResolvedValue(organization) },
      user: { upsert: vi.fn().mockResolvedValue(user) },
      organizationMembership: { upsert: vi.fn().mockResolvedValue({ id: 'membership-1' }) },
      authSession: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    let inTransaction = false;
    const prisma = {
      $transaction: vi.fn(async (callback) => {
        inTransaction = true;
        try {
          return await callback(tx);
        } finally {
          inTransaction = false;
        }
      }),
    };
    const formulaCalls: Array<{ inTransaction: boolean }> = [];
    ensureFormula.mockImplementation(async () => {
      formulaCalls.push({ inTransaction });
    });
    const plan = buildLocalAuthBootstrapPlan({
      email: 'dev@example.com', name: 'Dev User',
      organizationName: 'KidItem Dev', organizationSlug: 'kiditem-dev',
    }, 'scrypt$hash', new Date('2026-08-29T00:00:00.000Z'));

    await bootstrapLocalAuthUser(prisma as never, plan);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(ensureFormula).toHaveBeenCalledTimes(1);
    expect(ensureFormula).toHaveBeenCalledWith(tx, 'organization-1');
    expect(formulaCalls).toEqual([{ inTransaction: true }]);
    expect(tx.organizationMembership.upsert.mock.invocationCallOrder[0])
      .toBeLessThan(ensureFormula.mock.invocationCallOrder[0]!);
    expect(ensureFormula.mock.invocationCallOrder[0])
      .toBeLessThan(tx.authSession.updateMany.mock.invocationCallOrder[0]!);
    expect(tx.organization.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { slug: 'kiditem-dev' },
    }));
    expect(tx.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: 'dev@example.com' },
    }));
    expect(tx.organizationMembership.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_userId: { organizationId: 'organization-1', userId: 'user-1' } },
    }));
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: new Date('2026-08-29T00:00:00.000Z') },
    });
  });

  it('fails the bootstrap transaction when the organization cannot be initialized', async () => {
    const tx = {
      organization: { upsert: vi.fn().mockResolvedValue({ id: 'organization-1' }) },
      user: { upsert: vi.fn().mockResolvedValue({ id: 'user-1' }) },
      organizationMembership: { upsert: vi.fn().mockResolvedValue({ id: 'membership-1' }) },
      authSession: { updateMany: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async (callback) => callback(tx)) };
    const failure = new Error('formula conflict');
    const initializeOrganization = vi.fn().mockRejectedValue(failure);
    const plan = buildLocalAuthBootstrapPlan({
      email: 'dev@example.com', name: 'Dev User',
      organizationName: 'KidItem Dev', organizationSlug: 'kiditem-dev',
    }, 'scrypt$hash');

    await expect(bootstrapLocalAuthUser(prisma as never, plan, initializeOrganization))
      .rejects.toBe(failure);
    expect(initializeOrganization).toHaveBeenCalledWith(tx, 'organization-1');
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
    expect(ensureFormula).not.toHaveBeenCalled();
  });
});
