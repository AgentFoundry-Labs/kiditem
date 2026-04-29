// apps/server/src/products/__tests__/master-code.service.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { MasterCodeService } from '../adapter/out/prisma/master-code.service';

function makePrismaMock(seqReturn: bigint) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ nextval: seqReturn }]),
  } as any;
}

describe('MasterCodeService', () => {
  it('formats sequence value 1 -> "M-00000001"', async () => {
    const svc = new MasterCodeService(makePrismaMock(1n));
    expect(await svc.generate()).toBe('M-00000001');
  });

  it('formats sequence value 42 -> "M-00000042"', async () => {
    const svc = new MasterCodeService(makePrismaMock(42n));
    expect(await svc.generate()).toBe('M-00000042');
  });

  it('formats sequence value 99999999 -> "M-99999999"', async () => {
    const svc = new MasterCodeService(makePrismaMock(99999999n));
    expect(await svc.generate()).toBe('M-99999999');
  });

  it('throws InternalServerError when sequence exceeds 8-digit ceiling', async () => {
    const svc = new MasterCodeService(makePrismaMock(100000000n));
    await expect(svc.generate()).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
