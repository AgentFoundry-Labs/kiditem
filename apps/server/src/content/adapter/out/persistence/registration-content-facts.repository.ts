import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ContentRegistrationFactsPort,
  RegistrationContentIds,
} from '../../../application/port/in/workspace/registration-content-facts.port';

/** 판매 상품 작업공간의 현재 상세 revision · 대표이미지 자산 id 를 한 번에 읽는다(KID-320). */
@Injectable()
export class RegistrationContentFactsRepositoryAdapter implements ContentRegistrationFactsPort {
  constructor(private readonly prisma: PrismaService) {}

  async readCurrentContentIds(input: {
    organizationId: string;
    salesProductIds: readonly string[];
  }): Promise<ReadonlyMap<string, RegistrationContentIds>> {
    const ids = [...new Set(input.salesProductIds)];
    const current = new Map<string, RegistrationContentIds>();
    if (ids.length === 0) return current;
    const workspaces = await this.prisma.contentWorkspace.findMany({
      where: {
        organizationId: input.organizationId,
        ownerType: 'sales_product',
        salesProductId: { in: ids },
        status: 'active',
        isDeleted: false,
      },
      select: {
        salesProductId: true,
        currentDetailPageRevisionId: true,
        currentThumbnailAsset: { select: { id: true, isDeleted: true } },
      },
    });
    for (const workspace of workspaces) {
      if (!workspace.salesProductId) continue;
      const asset = workspace.currentThumbnailAsset;
      current.set(workspace.salesProductId, {
        detailPageRevisionId: workspace.currentDetailPageRevisionId,
        thumbnailAssetId: asset && !asset.isDeleted ? asset.id : null,
      });
    }
    return current;
  }
}
