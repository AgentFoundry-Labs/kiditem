import { describe, expect, it, vi } from 'vitest';
import { NotImplementedException } from '@nestjs/common';
import { ReturnsService } from '../returns.service';

function makePrisma() {
  return {
    orderReturn: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  };
}

describe('ReturnsService — unsupported Coupang mutation', () => {
  it('rejects approval before reading or mutating the database', async () => {
    const prisma = makePrisma();
    const service = new ReturnsService(prisma as any);

    await expect(service.approve(12345, 'organization-1')).rejects.toBeInstanceOf(
      NotImplementedException,
    );
    expect(prisma.orderReturn.findFirst).not.toHaveBeenCalled();
    expect(prisma.orderReturn.findMany).not.toHaveBeenCalled();
  });
});
