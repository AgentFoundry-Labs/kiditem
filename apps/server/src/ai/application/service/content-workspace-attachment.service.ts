import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentArchiveService } from './content-archive.service';

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
    const [product, group, generationCount, conflictingGeneration] = await Promise.all([
      this.prisma.masterProduct.findFirst({
        where: { id: productId, organizationId, isDeleted: false },
        select: { id: true },
      }),
      this.prisma.contentGenerationGroup.findFirst({
        where: { id: groupId, organizationId },
        select: { id: true },
      }),
      this.prisma.contentGeneration.count({
        where: { organizationId, generationGroupId: groupId },
      }),
      this.prisma.contentGeneration.findFirst({
        where: {
          organizationId,
          generationGroupId: groupId,
          masterId: { not: null },
          NOT: { masterId: productId },
        },
        select: { id: true, masterId: true },
      }),
    ]);

    if (!product) throw new NotFoundException('MasterProduct not found');
    if (!group) throw new NotFoundException('Content generation group not found');
    if (generationCount === 0) {
      throw new BadRequestException('Content generation group has no generations');
    }
    if (conflictingGeneration) {
      throw new BadRequestException('Content generation group is already linked to a different product');
    }

    await this.prisma.$transaction([
      this.prisma.contentGeneration.updateMany({
        where: {
          organizationId,
          generationGroupId: groupId,
          masterId: null,
        },
        data: { masterId: productId },
      }),
      this.prisma.contentGenerationGroup.updateMany({
        where: { id: groupId, organizationId },
        data: { targetMasterId: productId },
      }),
    ]);

    return this.archive.listProductWorkspace(organizationId, productId, { page: 1, limit: 100 });
  }
}
