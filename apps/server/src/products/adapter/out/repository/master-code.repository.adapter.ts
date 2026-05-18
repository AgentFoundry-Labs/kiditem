import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { MasterCodePort } from '../../../application/port/out/master-code.port';
import type { ProductsRepositoryTransaction } from '../../../application/port/out/products-transaction.port';

type MasterCodeClient = Pick<Prisma.TransactionClient, 'masterCodeCounter'>;

@Injectable()
export class MasterCodeRepositoryAdapter implements MasterCodePort {
  static readonly COUNTER_KEY = 'master_product';
  static readonly MAX_VALUE = 99999999;

  constructor(private readonly prisma: PrismaService) {}

  async generate(tx?: ProductsRepositoryTransaction): Promise<string> {
    const client = (tx ?? this.prisma) as MasterCodeClient;
    const counter = await client.masterCodeCounter.upsert({
      where: { key: MasterCodeRepositoryAdapter.COUNTER_KEY },
      create: { key: MasterCodeRepositoryAdapter.COUNTER_KEY, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    const n = counter.value;
    if (n > MasterCodeRepositoryAdapter.MAX_VALUE) {
      throw new InternalServerErrorException(
        `master code counter overflow: ${n} > ${MasterCodeRepositoryAdapter.MAX_VALUE}`,
      );
    }
    return `M-${String(n).padStart(8, '0')}`;
  }
}
