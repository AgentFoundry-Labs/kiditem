import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MastersService } from '../../../../products/application/service/masters.service';
import type {
  AttachPrimaryImageInput,
  CoupangListingImageState,
  CoupangListingHandle,
  MasterCatalogPort,
} from '../../../application/port/out/master-catalog.port';

/**
 * `MASTER_CATALOG_PORT` 의 concrete adapter.
 *
 * products domain 의 `MastersService.create` (master + image rows + code 발급
 * 트랜잭션) 와 `prisma.channelListing` / `prisma.masterProduct` /
 * `prisma.masterProductImage` 직접 mutation 을 ai domain 으로부터 격리한다.
 *
 * 이 adapter 만 products domain 의 service 를 import 하므로, 향후 products
 * 도메인이 자체 port 를 노출하거나 mutation API 를 다듬으면 이 adapter 만
 * 영향받고 ai 의 application service 는 그대로.
 */
@Injectable()
export class MasterCatalogAdapter implements MasterCatalogPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masters: MastersService,
  ) {}

  async findCoupangListingImageStates(input: {
    organizationId: string;
    inventoryIds: string[];
  }): Promise<CoupangListingImageState[]> {
    const { organizationId, inventoryIds } = input;
    if (inventoryIds.length === 0) return [];

    const listings = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        channel: 'coupang',
        externalId: { in: inventoryIds },
        isDeleted: false,
      },
      select: {
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

    return listings.map((listing) => ({
      inventoryId: listing.externalId,
      hasImage: hasDisplayImage(listing.master),
    }));
  }

  async ensureCoupangMaster(input: {
    organizationId: string;
    inventoryId: string;
    name: string;
    sourceUrl: string;
  }): Promise<CoupangListingHandle> {
    const { organizationId, inventoryId, name, sourceUrl } = input;

    const listing = await this.prisma.channelListing.findFirst({
      where: {
        organizationId,
        channel: 'coupang',
        externalId: inventoryId,
        isDeleted: false,
      },
      select: {
        id: true,
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

    if (listing) {
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

    // 새 master + listing 1쌍 생성. MastersService.create 가 code 발급 + image
    // row 정규화를 트랜잭션 안에서 수행하므로 outerTx 로 묶음.
    return this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const master = await this.masters.create(
          organizationId,
          {
            name: name || `쿠팡 인벤토리 ${inventoryId}`,
            sourcePlatform: 'coupang',
            sourceUrl,
          },
          tx,
        );
        await tx.channelListing.create({
          data: {
            organizationId,
            masterId: master.id,
            channel: 'coupang',
            externalId: inventoryId,
            channelName: name || null,
            status: 'active',
          } satisfies Prisma.ChannelListingUncheckedCreateInput,
        });
        return { masterId: master.id, hasImage: false };
      },
      { timeout: 15_000 },
    );
  }

  async attachPrimaryImage(input: AttachPrimaryImageInput): Promise<boolean> {
    const { organizationId, masterId, storageKey, url, mimeType, fileSize, sourceUrl } = input;

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
            sourcePlatform: 'coupang',
            sourceUrl,
          },
        });
        return true;
      },
      { timeout: 15_000 },
    );
  }
}

function hasDisplayImage(master: {
  imageUrl: string | null;
  thumbnailUrl: string | null;
  images: Array<{ id: string }>;
}): boolean {
  return Boolean(master.imageUrl || master.thumbnailUrl || master.images.length > 0);
}
