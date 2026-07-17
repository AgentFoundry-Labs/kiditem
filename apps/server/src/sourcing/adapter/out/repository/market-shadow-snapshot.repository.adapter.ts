import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  MARKET_SHADOW_SNAPSHOT_SCOPE,
  type MarketShadowSnapshotClaimResult,
  type MarketShadowSnapshotRepositoryPort,
  type MarketShadowSnapshotRow,
} from '../../../application/port/out/repository/market-shadow-snapshot.repository.port';
import type { Prisma } from '@prisma/client';

@Injectable()
export class MarketShadowSnapshotRepositoryAdapter
  implements MarketShadowSnapshotRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async claimDaily(input: {
    organizationId: string;
    businessDate: Date;
    payload: Record<string, unknown>;
  }): Promise<MarketShadowSnapshotClaimResult> {
    return this.prisma.$transaction(async (tx) => {
      const lockKey = [
        MARKET_SHADOW_SNAPSHOT_SCOPE,
        input.organizationId,
        input.businessDate.toISOString().slice(0, 10),
      ].join(':');

      await tx.$queryRaw<Array<{ lock: string }>>`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
        FROM (SELECT ${input.organizationId}::uuid AS organization_id) AS tenant
        WHERE organization_id = ${input.organizationId}::uuid
      `;

      const existing = await tx.sourcingWorkspaceSnapshot.findUnique({
        where: {
          organizationId_scope_businessDate: {
            organizationId: input.organizationId,
            scope: MARKET_SHADOW_SNAPSHOT_SCOPE,
            businessDate: input.businessDate,
          },
        },
      });
      if (existing) {
        return {
          claimed: false,
          row: toRow(existing),
        };
      }

      const created = await tx.sourcingWorkspaceSnapshot.create({
        data: {
          organizationId: input.organizationId,
          scope: MARKET_SHADOW_SNAPSHOT_SCOPE,
          businessDate: input.businessDate,
          payload: toInputJsonObject(input.payload),
        },
      });
      return {
        claimed: true,
        row: toRow(created),
      };
    });
  }

  async finalizeDaily(input: {
    organizationId: string;
    businessDate: Date;
    payload: Record<string, unknown>;
  }): Promise<MarketShadowSnapshotRow> {
    const existing = await this.prisma.sourcingWorkspaceSnapshot.findUnique({
      where: {
        organizationId_scope_businessDate: {
          organizationId: input.organizationId,
          scope: MARKET_SHADOW_SNAPSHOT_SCOPE,
          businessDate: input.businessDate,
        },
      },
      select: { id: true },
    });
    if (!existing) {
      throw new Error(
        `Market shadow snapshot was not claimed for ${input.businessDate.toISOString().slice(0, 10)}`,
      );
    }

    const updated = await this.prisma.sourcingWorkspaceSnapshot.update({
      where: {
        organizationId_scope_businessDate: {
          organizationId: input.organizationId,
          scope: MARKET_SHADOW_SNAPSHOT_SCOPE,
          businessDate: input.businessDate,
        },
      },
      data: {
        payload: toInputJsonObject(input.payload),
      },
    });
    return toRow(updated);
  }

  async listRecent(input: {
    organizationId: string;
    fromBusinessDate: Date;
    toBusinessDate: Date;
    limit: number;
  }): Promise<MarketShadowSnapshotRow[]> {
    const rows = await this.prisma.sourcingWorkspaceSnapshot.findMany({
      where: {
        organizationId: input.organizationId,
        scope: MARKET_SHADOW_SNAPSHOT_SCOPE,
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
}

function toInputJsonObject(payload: Record<string, unknown>): Prisma.InputJsonObject {
  assertJsonValue(payload, new WeakSet<object>());
  return payload as Prisma.InputJsonObject;
}

function assertJsonValue(value: unknown, ancestors: WeakSet<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    throw new TypeError('Market shadow snapshot payload cannot contain non-finite numbers');
  }
  if (typeof value !== 'object') {
    throw new TypeError('Market shadow snapshot payload must contain only JSON values');
  }
  if (ancestors.has(value)) {
    throw new TypeError('Market shadow snapshot payload cannot contain circular references');
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item, ancestors);
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Market shadow snapshot payload must contain only plain objects');
    }
    for (const item of Object.values(value)) assertJsonValue(item, ancestors);
  }
  ancestors.delete(value);
}

function toRow(row: {
  id: string;
  organizationId: string;
  scope: string;
  businessDate: Date;
  payload: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): MarketShadowSnapshotRow {
  if (row.scope !== MARKET_SHADOW_SNAPSHOT_SCOPE) {
    throw new Error(`Unexpected market shadow snapshot scope: ${row.scope}`);
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    businessDate: row.businessDate,
    payload: jsonRecord(row.payload),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
