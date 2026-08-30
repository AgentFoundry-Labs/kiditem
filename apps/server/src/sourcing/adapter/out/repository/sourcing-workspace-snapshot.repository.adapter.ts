import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { ActiveOperationAttemptTransaction } from '../../../../operations/application/port/active-browser-attempt-transaction';
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
    projectionVersion?: string;
    inputHash?: string;
  }): Promise<SourcingWorkspaceSnapshotRow | null> {
    const row = await this.prisma.sourcingWorkspaceSnapshot.findUnique({
      where: {
        organizationId_scope_businessDate_projectionVersion_inputHash: {
          organizationId: input.organizationId,
          scope: input.scope,
          businessDate: input.businessDate,
          projectionVersion: input.projectionVersion ?? 'legacy',
          inputHash: input.inputHash ?? '',
        },
      },
    });
    return row ? toRow(row) : null;
  }

  async listRecent(input: {
    organizationId: string;
    scope: SourcingWorkspaceSnapshotScope;
    fromBusinessDate: Date;
    toBusinessDate: Date;
    limit: number;
    projectionVersion?: string;
    inputHash?: string;
  }): Promise<SourcingWorkspaceSnapshotRow[]> {
    const rows = await this.prisma.sourcingWorkspaceSnapshot.findMany({
      where: {
        organizationId: input.organizationId,
        scope: input.scope,
        projectionVersion: input.projectionVersion ?? 'legacy',
        inputHash: input.inputHash ?? '',
        businessDate: {
          gte: input.fromBusinessDate,
          lte: input.toBusinessDate,
        },
      },
      orderBy: {
        businessDate: 'desc',
      },
      take: input.limit,
    });
    return rows.map(toRow);
  }

  async upsert(input: {
    organizationId: string;
    scope: SourcingWorkspaceSnapshotScope;
    businessDate: Date;
    projectionVersion?: string;
    inputHash?: string;
    payload: Record<string, unknown>;
    expiresAt?: Date | null;
  }): Promise<SourcingWorkspaceSnapshotRow> {
    const row = await this.prisma.sourcingWorkspaceSnapshot.upsert({
      where: {
        organizationId_scope_businessDate_projectionVersion_inputHash: {
          organizationId: input.organizationId,
          scope: input.scope,
          businessDate: input.businessDate,
          projectionVersion: input.projectionVersion ?? 'legacy',
          inputHash: input.inputHash ?? '',
        },
      },
      create: {
        organizationId: input.organizationId,
        scope: input.scope,
        businessDate: input.businessDate,
        projectionVersion: input.projectionVersion ?? 'legacy',
        inputHash: input.inputHash ?? '',
        payload: input.payload as Prisma.InputJsonValue,
        expiresAt: input.expiresAt ?? null,
      },
      update: {
        payload: input.payload as Prisma.InputJsonValue,
        expiresAt: input.expiresAt ?? null,
      },
    });
    return toRow(row);
  }

  async upsertInAttempt(
    transaction: ActiveOperationAttemptTransaction,
    input: {
      organizationId: string;
      scope: SourcingWorkspaceSnapshotScope;
      businessDate: Date;
      projectionVersion?: string;
      inputHash?: string;
      payload: Record<string, unknown>;
      expiresAt?: Date | null;
    },
  ): Promise<SourcingWorkspaceSnapshotRow> {
    const row = await asTransaction(transaction).sourcingWorkspaceSnapshot.upsert({
      where: {
        organizationId_scope_businessDate_projectionVersion_inputHash: {
          organizationId: input.organizationId,
          scope: input.scope,
          businessDate: input.businessDate,
          projectionVersion: input.projectionVersion ?? 'legacy',
          inputHash: input.inputHash ?? '',
        },
      },
      create: {
        organizationId: input.organizationId,
        scope: input.scope,
        businessDate: input.businessDate,
        projectionVersion: input.projectionVersion ?? 'legacy',
        inputHash: input.inputHash ?? '',
        payload: input.payload as Prisma.InputJsonValue,
        expiresAt: input.expiresAt ?? null,
      },
      update: {
        payload: input.payload as Prisma.InputJsonValue,
        expiresAt: input.expiresAt ?? null,
      },
    });
    return toRow(row);
  }

}

function asTransaction(transaction: ActiveOperationAttemptTransaction): Prisma.TransactionClient {
  return transaction as Prisma.TransactionClient;
}

function toRow(row: {
  id: string;
  organizationId: string;
  scope: string;
  businessDate: Date;
  projectionVersion: string;
  inputHash: string;
  payload: Prisma.JsonValue;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): SourcingWorkspaceSnapshotRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    scope: row.scope as SourcingWorkspaceSnapshotScope,
    businessDate: row.businessDate,
    projectionVersion: row.projectionVersion,
    inputHash: row.inputHash,
    payload: jsonRecord(row.payload),
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
