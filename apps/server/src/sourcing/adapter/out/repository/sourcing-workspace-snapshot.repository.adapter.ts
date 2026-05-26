import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SourcingWorkspaceSnapshotRepositoryPort,
  SourcingWorkspaceSnapshotRow,
  SourcingWorkspaceSnapshotScope,
} from '../../../application/port/out/repository/sourcing-workspace-snapshot.repository.port';

@Injectable()
export class SourcingWorkspaceSnapshotRepositoryAdapter implements SourcingWorkspaceSnapshotRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async find(input: {
    organizationId: string;
    scope: SourcingWorkspaceSnapshotScope;
    businessDate: Date;
  }): Promise<SourcingWorkspaceSnapshotRow | null> {
    const row = await this.prisma.sourcingWorkspaceSnapshot.findUnique({
      where: {
        organizationId_scope_businessDate: {
          organizationId: input.organizationId,
          scope: input.scope,
          businessDate: input.businessDate,
        },
      },
    });
    return row ? toRow(row) : null;
  }

  async upsert(input: {
    organizationId: string;
    scope: SourcingWorkspaceSnapshotScope;
    businessDate: Date;
    payload: Record<string, unknown>;
  }): Promise<SourcingWorkspaceSnapshotRow> {
    const row = await this.prisma.sourcingWorkspaceSnapshot.upsert({
      where: {
        organizationId_scope_businessDate: {
          organizationId: input.organizationId,
          scope: input.scope,
          businessDate: input.businessDate,
        },
      },
      create: {
        organizationId: input.organizationId,
        scope: input.scope,
        businessDate: input.businessDate,
        payload: input.payload as Prisma.InputJsonValue,
      },
      update: {
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
    return toRow(row);
  }
}

function toRow(row: {
  id: string;
  organizationId: string;
  scope: string;
  businessDate: Date;
  payload: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): SourcingWorkspaceSnapshotRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    scope: row.scope as SourcingWorkspaceSnapshotScope,
    businessDate: row.businessDate,
    payload: jsonRecord(row.payload),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
