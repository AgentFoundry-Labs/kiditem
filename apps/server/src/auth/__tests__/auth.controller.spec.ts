import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AuthController } from '../auth.controller';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth.types';

const ORG_ID = '22222222-2222-4222-8222-222222222222';
const MEMBERSHIP_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '11111111-1111-4111-8111-111111111111';

const AUTH_USER: AuthUser = {
  id: USER_ID,
  organizationId: ORG_ID,
  membershipId: MEMBERSHIP_ID,
  role: 'owner',
  type: 'human',
  email: 'test@kiditem.local',
};

function makePrisma(findUnique: ReturnType<typeof vi.fn>): PrismaService {
  return { user: { findUnique } } as unknown as PrismaService;
}

describe('AuthController.me', () => {
  it('returns AuthUserPublic merged from req.authUser + users row', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: USER_ID,
      email: 'test@kiditem.local',
      name: 'Test User',
      type: 'human',
    });
    const ctrl = new AuthController(makePrisma(findUnique));

    const result = await ctrl.me(AUTH_USER);

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: USER_ID },
      select: { id: true, email: true, name: true, type: true },
    });
    expect(result).toEqual({
      id: USER_ID,
      email: 'test@kiditem.local',
      name: 'Test User',
      type: 'human',
      role: 'owner',
      organizationId: ORG_ID,
      membershipId: MEMBERSHIP_ID,
    });
  });

  it('returns AuthUserPublic with null organization for system/unassigned user', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: USER_ID,
      email: 'system@kiditem.local',
      name: 'System',
      type: 'human',
    });
    const ctrl = new AuthController(makePrisma(findUnique));
    const systemAuthUser: AuthUser = {
      ...AUTH_USER,
      organizationId: null,
      membershipId: null,
      role: 'member',
    };

    const result = await ctrl.me(systemAuthUser);

    expect(result.organizationId).toBeNull();
    expect(result.membershipId).toBeNull();
  });

  it('throws NotFoundException when local users row missing', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const ctrl = new AuthController(makePrisma(findUnique));
    await expect(ctrl.me(AUTH_USER)).rejects.toBeInstanceOf(NotFoundException);
  });
});
