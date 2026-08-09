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
      },
      update: {
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
    return toRow(row);
  }

  async append1688Items(input: {
    organizationId: string;
    businessDate: Date;
    source: string;
    keyword?: string;
    category?: string;
    items: Record<string, unknown>[];
    limit: number;
    generatedAt: Date;
  }): Promise<SourcingWorkspaceSnapshotRow> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`sourcing-workspace:1688_new_products:${input.organizationId}:${input.businessDate.toISOString()}`}, 0)
        )::text AS "lock"
      `;

      const existing = await tx.sourcingWorkspaceSnapshot.findUnique({
        where: {
          organizationId_scope_businessDate_projectionVersion_inputHash: {
            organizationId: input.organizationId,
            scope: '1688_new_products',
            businessDate: input.businessDate,
            projectionVersion: 'legacy',
            inputHash: '',
          },
        },
      });
      const existingItems = extract1688Items(existing?.payload);
      const payload: Record<string, unknown> = {
        version: 1,
        input: {
          source: input.source,
          keyword: input.keyword,
          category: input.category,
        },
        result: {
          keyword: input.keyword,
          category: input.category,
          items: merge1688Items([...input.items, ...existingItems]).slice(0, input.limit),
        },
        meta: {
          generatedAt: input.generatedAt.toISOString(),
          generationSource: 'manual',
          generatorVersion: 'sourcing-workspace-snapshot.v2',
        },
      };

      const row = await tx.sourcingWorkspaceSnapshot.upsert({
        where: {
          organizationId_scope_businessDate_projectionVersion_inputHash: {
            organizationId: input.organizationId,
            scope: '1688_new_products',
            businessDate: input.businessDate,
            projectionVersion: 'legacy',
            inputHash: '',
          },
        },
        create: {
          organizationId: input.organizationId,
          scope: '1688_new_products',
          businessDate: input.businessDate,
          projectionVersion: 'legacy',
          inputHash: '',
          payload: payload as Prisma.InputJsonValue,
        },
        update: { payload: payload as Prisma.InputJsonValue },
      });
      return toRow(row);
    });
  }
}

function extract1688Items(payload: Prisma.JsonValue | undefined): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const result = 'result' in payload ? payload.result : undefined;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return [];
  const items = 'items' in result ? result.items : undefined;
  return Array.isArray(items)
    ? items.flatMap((item) => (
      item !== null && typeof item === 'object' && !Array.isArray(item)
        ? [item as Record<string, unknown>]
        : []
    ))
    : [];
}

function merge1688Items(items: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = stable1688ItemKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stable1688ItemKey(item: Record<string, unknown>): string | null {
  const offerId = typeof item.offerId === 'string' ? item.offerId.trim() : '';
  if (offerId) return `offer:${offerId}`;
  const sourceUrl = typeof item.sourceUrl === 'string' ? item.sourceUrl.trim() : '';
  return sourceUrl ? `url:${sourceUrl}` : null;
}

function toRow(row: {
  id: string;
  organizationId: string;
  scope: string;
  businessDate: Date;
  projectionVersion: string;
  inputHash: string;
  payload: Prisma.JsonValue;
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
