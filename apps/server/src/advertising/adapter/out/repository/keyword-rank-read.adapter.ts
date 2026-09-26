import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  AdvertisingKeywordRankReadPort,
  WingRankCoverage,
} from '../../../application/port/in/capability/keyword-rank-read.port';
import { readWingRankCoverage } from '../persistence/read/keyword-rank-facts';

@Injectable()
export class AdvertisingKeywordRankReadAdapter implements AdvertisingKeywordRankReadPort {
  constructor(private readonly prisma: PrismaService) {}

  readWingRankCoverage(organizationId: string, vendorItemIds: readonly string[]): Promise<WingRankCoverage> {
    return this.prisma.$transaction(
      (tx) => readWingRankCoverage(tx, { organizationId, vendorItemIds }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
