import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentArchiveService } from './content-archive.service';
import { groupUrlAssetKey } from './content-asset.service';

@Injectable()
export class ContentWorkspaceAttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly archive: ContentArchiveService,
  ) {}

  async attachGroupToProduct(
    organizationId: string,
    groupId: string,
    productId: string,
  ) {
    const [product, group, generationCount, productWorkspace] = await Promise.all([
      this.prisma.masterProduct.findFirst({
        where: { id: productId, organizationId, isDeleted: false },
        select: { id: true },
      }),
      this.prisma.contentGenerationGroup.findFirst({
        where: { id: groupId, organizationId },
        select: { id: true, targetMasterId: true },
      }),
      this.prisma.contentGeneration.count({
        where: { organizationId, generationGroupId: groupId },
      }),
      this.prisma.contentGenerationGroup.findFirst({
        where: {
          organizationId,
          groupType: 'product_workspace',
          targetMasterId: productId,
        },
        select: { id: true },
      }),
    ]);

    if (!product) throw new NotFoundException('MasterProduct not found');
    if (!group) throw new NotFoundException('Content generation group not found');
    if (generationCount === 0) {
      throw new BadRequestException('Content generation group has no generations');
    }
    if (group.targetMasterId && group.targetMasterId !== productId) {
      throw new BadRequestException('Content generation group is already linked to a different product');
    }

    await this.prisma.$transaction(async (tx) => {
      if (!productWorkspace || productWorkspace.id === groupId) {
        await tx.contentGenerationGroup.updateMany({
          where: { id: groupId, organizationId },
          data: {
            groupType: 'product_workspace',
            targetMasterId: productId,
          },
        });
        return;
      }

      await tx.contentGeneration.updateMany({
        where: { organizationId, generationGroupId: groupId },
        data: { generationGroupId: productWorkspace.id },
      });
      await this.moveAssetsToWorkspace(tx, organizationId, groupId, productWorkspace.id);
      await tx.contentGenerationGroup.deleteMany({
        where: {
          id: groupId,
          organizationId,
          generations: { none: {} },
          assets: { none: {} },
        },
      });
    });

    return this.archive.listProductWorkspace(organizationId, productId, { page: 1, limit: 100 });
  }

  private async moveAssetsToWorkspace(
    tx: Prisma.TransactionClient,
    organizationId: string,
    fromGroupId: string,
    toGroupId: string,
  ): Promise<void> {
    const assets = await tx.contentAsset.findMany({
      where: { organizationId, generationGroupId: fromGroupId },
      select: { id: true, url: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const asset of assets) {
      const assetKey = groupUrlAssetKey(toGroupId, asset.url);
      const existing = await tx.contentAsset.findFirst({
        where: { organizationId, assetKey },
        select: { id: true, isDeleted: true },
      });

      if (!existing) {
        await tx.contentAsset.updateMany({
          where: { organizationId, id: asset.id },
          data: { generationGroupId: toGroupId, assetKey },
        });
        continue;
      }

      if (existing.isDeleted) {
        await tx.contentAsset.updateMany({
          where: { organizationId, id: existing.id },
          data: { isDeleted: false, deletedAt: null },
        });
      }

      const usages = await tx.contentGenerationAssetUsage.findMany({
        where: { organizationId, contentAssetId: asset.id },
        select: { id: true, contentGenerationId: true },
      });
      for (const usage of usages) {
        const duplicate = await tx.contentGenerationAssetUsage.findFirst({
          where: {
            organizationId,
            contentGenerationId: usage.contentGenerationId,
            contentAssetId: existing.id,
          },
          select: { id: true },
        });
        if (duplicate) {
          await tx.contentGenerationAssetUsage.deleteMany({
            where: { organizationId, id: usage.id },
          });
        } else {
          await tx.contentGenerationAssetUsage.updateMany({
            where: { organizationId, id: usage.id },
            data: { contentAssetId: existing.id },
          });
        }
      }

      await tx.contentGenerationSource.updateMany({
        where: { organizationId, contentAssetId: asset.id },
        data: { contentAssetId: existing.id },
      });
      await tx.contentAsset.deleteMany({
        where: { organizationId, id: asset.id },
      });
    }
  }
}
