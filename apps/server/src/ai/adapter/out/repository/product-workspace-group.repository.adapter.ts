import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ProductWorkspaceGroupRepositoryPort,
  ProductWorkspaceGroupSnapshot,
  ProductWorkspaceGroupSource,
} from '../../../application/port/out/product-workspace-group.repository.port';

@Injectable()
export class ProductWorkspaceGroupRepositoryAdapter
implements ProductWorkspaceGroupRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async ensureProductWorkspaceGroup(input: {
    organizationId: string;
    productId: string;
    title: string;
    triggeredByUserId: string | null;
    source: ProductWorkspaceGroupSource;
  }): Promise<ProductWorkspaceGroupSnapshot> {
    const existing = await this.find(input);
    if (existing) return existing;

    try {
      return await this.prisma.contentGenerationGroup.create({
        data: {
          organizationId: input.organizationId,
          groupType: 'product_workspace',
          targetMasterId: input.productId,
          title: input.title.slice(0, 80),
          createdByUserId: input.triggeredByUserId,
          metadata: { source: input.source },
        },
        select: { id: true, targetMasterId: true },
      });
    } catch (error) {
      const raced = await this.find(input);
      if (raced) return raced;
      throw error;
    }
  }

  private find(input: {
    organizationId: string;
    productId: string;
  }): Promise<ProductWorkspaceGroupSnapshot | null> {
    return this.prisma.contentGenerationGroup.findFirst({
      where: {
        organizationId: input.organizationId,
        groupType: 'product_workspace',
        targetMasterId: input.productId,
      },
      select: { id: true, targetMasterId: true },
    });
  }
}
