import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { groupUrlAssetKey } from '../../../domain/content-asset-key';
import type {
  ContentWorkspaceAttachmentPreflight,
  ContentWorkspaceAttachmentRepositoryPort,
} from '../../../application/port/out/repository/content-workspace-attachment.repository.port';

@Injectable()
export class ContentWorkspaceAttachmentRepositoryAdapter
implements ContentWorkspaceAttachmentRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async loadAttachPreflight(input: {
    organizationId: string;
    groupId: string;
    productId: string;
  }): Promise<ContentWorkspaceAttachmentPreflight> {
    const [product, group, generationCount, productWorkspace] = await Promise.all([
      this.prisma.masterProduct.findFirst({
        where: { id: input.productId, organizationId: input.organizationId, isDeleted: false },
        select: { id: true },
      }),
      this.prisma.contentGenerationGroup.findFirst({
        where: { id: input.groupId, organizationId: input.organizationId },
        select: { id: true, targetMasterId: true },
      }),
      this.prisma.contentGeneration.count({
        where: {
          organizationId: input.organizationId,
          generationGroupId: input.groupId,
        },
      }),
      this.prisma.contentGenerationGroup.findFirst({
        where: {
          organizationId: input.organizationId,
          groupType: 'product_workspace',
          targetMasterId: input.productId,
        },
        select: { id: true },
      }),
    ]);

    return { product, group, generationCount, productWorkspace };
  }

  async attachGroupToProduct(input: {
    organizationId: string;
    groupId: string;
    productId: string;
    productWorkspaceId: string | null;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (!input.productWorkspaceId || input.productWorkspaceId === input.groupId) {
        await tx.contentGenerationGroup.updateMany({
          where: { id: input.groupId, organizationId: input.organizationId },
          data: {
            groupType: 'product_workspace',
            targetMasterId: input.productId,
          },
        });
        return;
      }

      await tx.contentGeneration.updateMany({
        where: { organizationId: input.organizationId, generationGroupId: input.groupId },
        data: { generationGroupId: input.productWorkspaceId },
      });
      await this.moveAssetsToWorkspace(
        tx,
        input.organizationId,
        input.groupId,
        input.productWorkspaceId,
      );
      await tx.contentGenerationGroup.deleteMany({
        where: {
          id: input.groupId,
          organizationId: input.organizationId,
          generations: { none: {} },
          assets: { none: {} },
        },
      });
    });
  }

  private async moveAssetsToWorkspace(
    tx: {
      contentAsset: {
        findMany(args: any): Promise<Array<{ id: string; url: string }>>;
        findFirst(args: any): Promise<{ id: string; isDeleted: boolean } | null>;
        updateMany(args: any): Promise<unknown>;
        deleteMany(args: any): Promise<unknown>;
      };
      contentGenerationAssetUsage: {
        findMany(args: any): Promise<Array<{ id: string; contentGenerationId: string }>>;
        findFirst(args: any): Promise<{ id: string } | null>;
        deleteMany(args: any): Promise<unknown>;
        updateMany(args: any): Promise<unknown>;
      };
      contentGenerationSource: {
        updateMany(args: any): Promise<unknown>;
      };
    },
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
