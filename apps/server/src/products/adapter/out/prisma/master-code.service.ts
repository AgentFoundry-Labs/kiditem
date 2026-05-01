// apps/server/src/products/adapter/out/prisma/master-code.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

type MasterCodeClient = Pick<Prisma.TransactionClient, 'masterCodeCounter'>;

@Injectable()
export class MasterCodeService {
  static readonly COUNTER_KEY = 'master_product';
  static readonly MAX_VALUE = 99999999;

  constructor(private readonly prisma: PrismaService) {}

  async generate(client: MasterCodeClient = this.prisma): Promise<string> {
    const counter = await client.masterCodeCounter.upsert({
      where: { key: MasterCodeService.COUNTER_KEY },
      create: { key: MasterCodeService.COUNTER_KEY, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    const n = counter.value;
    if (n > MasterCodeService.MAX_VALUE) {
      throw new InternalServerErrorException(
        `master code counter overflow: ${n} > ${MasterCodeService.MAX_VALUE}`,
      );
    }
    return `M-${String(n).padStart(8, '0')}`;
  }
}
