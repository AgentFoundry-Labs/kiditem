import { Injectable } from '@nestjs/common';
import type { SellpiaManualMatchSnapshotStatus } from '@kiditem/shared/sellpia-manual-match';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SellpiaManualMatchAliasRecord,
  SellpiaManualMatchRepositoryPort,
} from '../../../application/port/out/repository/sellpia-manual-match.repository.port';

const CREATE_BATCH_SIZE = 5_000;
const COMPLETED_CATALOG_SOURCE_TYPES = [
  'coupang_wing_catalog',
  'coupang_rocket_catalog_seed',
  'coupang_rocket_po_catalog',
] as const;
const PUBLISHED_BROWSER_CATALOG_SOURCE = 'coupang_catalog_browser';

@Injectable()
export class SellpiaManualMatchRepositoryAdapter
implements SellpiaManualMatchRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentStatus(
    organizationId: string,
  ): Promise<SellpiaManualMatchSnapshotStatus | null> {
    const snapshot = await this.prisma.sellpiaManualMatchSnapshot.findUnique({
      where: { organizationId },
      select: {
        targetCount: true,
        matchedTargetCount: true,
        aliasCount: true,
        snapshotHash: true,
        capturedAt: true,
      },
    });
    return snapshot ? toStatus(snapshot) : null;
  }

  async findByNormalizedAliases(
    organizationId: string,
    normalizedAliases: string[],
  ): Promise<SellpiaManualMatchAliasRecord[]> {
    if (normalizedAliases.length === 0) return [];
    const rows = await this.prisma.sellpiaManualMatchAlias.findMany({
      where: {
        organizationId,
        normalizedAlias: { in: normalizedAliases },
      },
      select: {
        sellpiaInventorySkuId: true,
        aliasTitle: true,
        normalizedAlias: true,
        itemCount: true,
        matchedType: true,
        evidenceCount: true,
      },
      orderBy: [
        { normalizedAlias: 'asc' },
        { sellpiaInventorySkuId: 'asc' },
        { itemCount: 'asc' },
      ],
    });
    return rows.map((row) => ({
      ...row,
      matchedType: checkedMatchedType(row.matchedType),
    }));
  }

  async listCurrentChannelAliasCandidates(
    organizationId: string,
  ): Promise<string[]> {
    const listings = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        isActive: true,
        OR: [
          {
            lastImportRun: {
              is: {
                organizationId,
                status: 'completed',
                sourceType: { in: [...COMPLETED_CATALOG_SOURCE_TYPES] },
              },
            },
          },
          {
            options: {
              some: {
                organizationId,
                isActive: true,
                rawJson: {
                  path: ['source'],
                  equals: PUBLISHED_BROWSER_CATALOG_SOURCE,
                },
              },
            },
          },
        ],
      },
      select: {
        displayName: true,
        channelName: true,
        options: {
          where: { organizationId, isActive: true },
          select: { itemName: true },
        },
      },
      orderBy: { id: 'asc' },
    });
    const candidates = new Set<string>();
    for (const listing of listings) {
      const listingNames = [...new Set([listing.channelName, listing.displayName]
        .map((value) => value?.trim() ?? '')
        .filter(Boolean))];
      for (const listingName of listingNames) candidates.add(listingName);
      for (const option of listing.options) {
        const itemName = option.itemName?.trim() || null;
        if (itemName) {
          if (listingNames.length === 0) {
            candidates.add(itemName);
          } else {
            for (const listingName of listingNames) {
              candidates.add(`${listingName}:${itemName}`);
            }
          }
        }
      }
    }
    return [...candidates].sort();
  }

  async replaceCurrent(input: {
    organizationId: string;
    status: SellpiaManualMatchSnapshotStatus;
    rows: SellpiaManualMatchAliasRecord[];
  }): Promise<SellpiaManualMatchSnapshotStatus> {
    await this.prisma.$transaction(async (tx) => {
      await tx.sellpiaManualMatchSnapshot.deleteMany({
        where: { organizationId: input.organizationId },
      });
      const snapshot = await tx.sellpiaManualMatchSnapshot.create({
        data: {
          organizationId: input.organizationId,
          targetCount: input.status.targetCount,
          matchedTargetCount: input.status.matchedTargetCount,
          aliasCount: input.status.aliasCount,
          snapshotHash: input.status.snapshotHash,
          capturedAt: new Date(input.status.capturedAt),
        },
        select: { id: true },
      });
      for (let offset = 0; offset < input.rows.length; offset += CREATE_BATCH_SIZE) {
        const batch = input.rows.slice(offset, offset + CREATE_BATCH_SIZE);
        await tx.sellpiaManualMatchAlias.createMany({
          data: batch.map((row) => ({
            organizationId: input.organizationId,
            snapshotId: snapshot.id,
            ...row,
          })),
        });
      }
    });
    return input.status;
  }
}

function toStatus(value: {
  targetCount: number;
  matchedTargetCount: number;
  aliasCount: number;
  snapshotHash: string;
  capturedAt: Date;
}): SellpiaManualMatchSnapshotStatus {
  return { ...value, capturedAt: value.capturedAt.toISOString() };
}

function checkedMatchedType(value: string): 'M' | 'P' | 'E' {
  if (value === 'M' || value === 'P' || value === 'E') return value;
  throw new Error(`Unsupported Sellpia manual-match type: ${value}`);
}
