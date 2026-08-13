import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SourcingInterestTargetRecord,
  SourcingInterestTargetRepositoryPort,
  UpsertSourcingInterestTargetCommand,
} from '../../../application/port/out/repository/sourcing-interest-target.repository.port';

@Injectable()
export class SourcingInterestTargetRepositoryAdapter
  implements SourcingInterestTargetRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<SourcingInterestTargetRecord[]> {
    const rows = await this.prisma.sourcingInterestTarget.findMany({
      where: { organizationId, enabled: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: 500,
    });
    return rows.map(toRecord);
  }

  async upsert(
    command: UpsertSourcingInterestTargetCommand,
  ): Promise<SourcingInterestTargetRecord> {
    const row = await this.prisma.sourcingInterestTarget.upsert({
      where: {
        organizationId_targetKey: {
          organizationId: command.organizationId,
          targetKey: command.targetKey,
        },
      },
      create: {
        organizationId: command.organizationId,
        targetKey: command.targetKey,
        targetType: command.targetType,
        label: command.label,
        sourceKeys: [command.source],
        keyword: command.keyword,
        category: command.category,
        productId: command.productId,
        itemId: command.itemId,
        vendorItemId: command.vendorItemId,
        productName: command.productName,
      },
      update: {
        label: command.label,
        sourceKeys: [command.source],
        keyword: command.keyword,
        category: command.category,
        productId: command.productId,
        itemId: command.itemId,
        vendorItemId: command.vendorItemId,
        productName: command.productName,
        enabled: true,
        version: { increment: 1 },
      },
    });
    return toRecord(row);
  }

  async delete(input: {
    organizationId: string;
    id: string;
  }): Promise<boolean> {
    const result = await this.prisma.sourcingInterestTarget.deleteMany({
      where: { organizationId: input.organizationId, id: input.id },
    });
    return result.count === 1;
  }
}

function toRecord(row: {
  id: string;
  organizationId: string;
  targetKey: string;
  targetType: string;
  label: string;
  sourceKeys: string[];
  keyword: string | null;
  category: string | null;
  productId: string | null;
  itemId: string | null;
  vendorItemId: string | null;
  productName: string | null;
  enabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): SourcingInterestTargetRecord {
  return {
    ...row,
    targetType: row.targetType as SourcingInterestTargetRecord['targetType'],
  };
}
