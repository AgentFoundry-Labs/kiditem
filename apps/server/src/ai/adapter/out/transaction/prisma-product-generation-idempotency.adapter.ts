import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { ProductGenerationIdempotencyPort } from '../../../application/port/out/transaction/product-generation-idempotency.port';

@Injectable()
export class PrismaProductGenerationIdempotencyAdapter
  implements ProductGenerationIdempotencyPort
{
  constructor(private readonly prisma: PrismaService) {}

  runExclusive<T>(
    input: { organizationId: string; idempotencyKey: string },
    work: () => Promise<T>,
  ): Promise<T> {
    const lockKey = `product-generation:${input.organizationId}:${input.idempotencyKey}`;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        -- queryraw-tenancy-exempt: organization-scoped advisory lock; exact product-generation key contains organizationId.
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
      `;
      return work();
    }, { maxWait: 10_000, timeout: 60_000 });
  }
}
