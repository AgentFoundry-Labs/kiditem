import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  AttachPrimaryImageInput,
  FindCoupangMasterInput,
  CoupangListingImageState,
  CoupangListingHandle,
  MasterCatalogPort,
} from '../../../application/port/out/cross-domain/master-catalog.port';

/**
 * `MASTER_CATALOG_PORT` 의 concrete adapter.
 *
 * products/channelListing query 와 `prisma.masterProductImage` 직접 mutation 을
 * ai domain 으로부터 격리한다.
 *
 * 매칭되지 않은 Coupang row 는 MasterProduct 를 자동 생성하지 않는다. 사용자가
 * 매칭 화면에서 기존 ProductOption/MasterProduct 와 연결해야 한다.
 */
@Injectable()
export class MasterCatalogAdapter implements MasterCatalogPort {
  constructor(private readonly prisma: PrismaService) {}

  async findCoupangListingImageStates(input: {
    organizationId: string;
    inventoryIds: string[];
  }): Promise<CoupangListingImageState[]> {
    const { organizationId, inventoryIds } = input;
    if (inventoryIds.length === 0) return [];
    const channelAccountId = await this.findPrimaryCoupangAccountId(organizationId);

    const listings = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        channel: 'coupang',
        externalId: { in: inventoryIds },
        isDeleted: false,
        masterId: { not: null },
        ...(channelAccountId
          ? {
              OR: [
                { channelAccountId },
                { channelAccountId: null },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        masterId: true,
        channelAccountId: true,
        externalId: true,
        master: {
          select: {
            imageUrl: true,
            thumbnailUrl: true,
            images: {
              where: { organizationId, isDeleted: false },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });

    const linkedListings = listings.flatMap((listing) => {
      if (!listing.master || !listing.masterId) return [];
      return [{ ...listing, masterId: listing.masterId, master: listing.master }];
    });
    return preferAccountListings(linkedListings, channelAccountId).map(
      (listing) => ({
        inventoryId: listing.externalId,
        hasImage: hasDisplayImage(listing.master),
      }),
    );
  }

  async findCoupangMaster(input: FindCoupangMasterInput): Promise<CoupangListingHandle | null> {
    const { organizationId, inventoryId, legacyCode, name } = input;
    const channelAccountId = await this.findPrimaryCoupangAccountId(organizationId);

    const listings = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        channel: 'coupang',
        externalId: inventoryId,
        isDeleted: false,
        masterId: { not: null },
        ...(channelAccountId
          ? {
              OR: [
                { channelAccountId },
                { channelAccountId: null },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        externalId: true,
        channelAccountId: true,
        masterId: true,
        master: {
          select: {
            imageUrl: true,
            thumbnailUrl: true,
            images: {
              where: { organizationId, isDeleted: false },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ channelAccountId: 'asc' }, { updatedAt: 'desc' }],
      take: channelAccountId ? 3 : 2,
    });
    const linkedListings = listings.flatMap((candidate) => {
      if (!candidate.master || !candidate.masterId) return [];
      return [{
        ...candidate,
        masterId: candidate.masterId,
        master: candidate.master,
      }];
    });
    const listing = preferAccountListings(linkedListings, channelAccountId)[0] ?? null;

    if (listing?.master && listing.masterId) {
      // Wing 화면에서 상품명이 바뀌었을 수 있으니 channelName 만 리프레시.
      await this.prisma.channelListing.updateMany({
        where: { id: listing.id, organizationId, isDeleted: false },
        data: { channelName: name || undefined },
      });
      return {
        masterId: listing.masterId,
        hasImage: hasDisplayImage(listing.master),
      };
    }

    const normalizedLegacyCode = legacyCode?.trim();
    if (!normalizedLegacyCode) return null;

    const option = await this.prisma.productOption.findFirst({
      where: {
        organizationId,
        legacyCode: normalizedLegacyCode,
        isDeleted: false,
        isActive: true,
        master: { isDeleted: false },
      },
      select: {
        masterId: true,
        master: {
          select: {
            imageUrl: true,
            thumbnailUrl: true,
            images: {
              where: { organizationId, isDeleted: false },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!option) return null;

    if (channelAccountId) {
      await this.createCoupangListingFromLegacyMatch({
        organizationId,
        masterId: option.masterId,
        inventoryId,
        name,
        channelAccountId,
      });
    }

    return {
      masterId: option.masterId,
      hasImage: hasDisplayImage(option.master),
    };
  }

  private async createCoupangListingFromLegacyMatch(input: {
    organizationId: string;
    masterId: string;
    inventoryId: string;
    name: string;
    channelAccountId: string;
  }): Promise<void> {
    const { organizationId, masterId, inventoryId, name, channelAccountId } = input;
    try {
      await this.prisma.channelListing.create({
        data: {
          organizationId,
          masterId,
          channel: 'coupang',
          channelAccountId,
          externalId: inventoryId,
          channelName: name || null,
          status: 'active',
        } satisfies Prisma.ChannelListingUncheckedCreateInput,
      });
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) throw error;
      await this.prisma.channelListing.updateMany({
        where: {
          organizationId,
          channel: 'coupang',
          channelAccountId,
          externalId: inventoryId,
          isDeleted: false,
        },
        data: { channelName: name || undefined },
      });
    }
  }

  private async findPrimaryCoupangAccountId(organizationId: string): Promise<string | null> {
    const account = await this.prisma.channelAccount.findFirst({
      where: {
        organizationId,
        channel: 'coupang',
        isPrimary: true,
        status: 'active',
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    return account?.id ?? null;
  }

  async attachPrimaryImage(input: AttachPrimaryImageInput): Promise<boolean> {
    const { organizationId, masterId, storageKey, url, mimeType, fileSize } = input;

    return this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // 동시 다른 sync job 이 같은 master 에 이미지 첨부했을 가능성 — re-check.
        const current = await tx.masterProduct.findFirst({
          where: { id: masterId, organizationId, isDeleted: false },
          select: {
            imageUrl: true,
            thumbnailUrl: true,
            images: {
              where: { organizationId, isDeleted: false },
              select: { id: true },
              take: 1,
            },
          },
        });
        if (!current) throw new NotFoundException('master not found');
        if (hasDisplayImage(current)) return false;

        await tx.masterProductImage.create({
          data: {
            organizationId,
            masterId,
            url,
            storageKey,
            role: 'product',
            label: 'Coupang Wing',
            sortOrder: 0,
            source: 'coupang-wing',
            mimeType,
            fileSize,
            isPrimary: true,
          },
        });
        await tx.masterProduct.updateMany({
          where: { id: masterId, organizationId, isDeleted: false },
          data: {
            imageUrl: url,
          },
        });
        return true;
      },
      { timeout: 15_000 },
    );
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002');
}

function preferAccountListings<T extends { externalId: string; channelAccountId: string | null }>(
  listings: T[],
  channelAccountId: string | null,
): T[] {
  if (!channelAccountId) {
    const byExternalId = new Map<string, T[]>();
    for (const listing of listings) {
      byExternalId.set(listing.externalId, [
        ...(byExternalId.get(listing.externalId) ?? []),
        listing,
      ]);
    }
    return [...byExternalId.values()]
      .filter((group) => group.length === 1)
      .map((group) => group[0]);
  }
  const byExternalId = new Map<string, T>();
  for (const listing of listings) {
    const current = byExternalId.get(listing.externalId);
    if (!current || listing.channelAccountId === channelAccountId) {
      byExternalId.set(listing.externalId, listing);
    }
  }
  return [...byExternalId.values()];
}

function hasDisplayImage(master: {
  imageUrl: string | null;
  thumbnailUrl: string | null;
  images: Array<{ id: string }>;
}): boolean {
  return Boolean(master.imageUrl || master.thumbnailUrl || master.images.length > 0);
}
