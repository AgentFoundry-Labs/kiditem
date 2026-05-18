import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CONTENT_WORKSPACE_ATTACHMENT_REPOSITORY_PORT,
  type ContentWorkspaceAttachmentRepositoryPort,
} from '../port/out/content-workspace-attachment.repository.port';
import { ContentArchiveService } from './content-archive.service';

@Injectable()
export class ContentWorkspaceAttachmentService {
  constructor(
    @Inject(CONTENT_WORKSPACE_ATTACHMENT_REPOSITORY_PORT)
    private readonly repository: ContentWorkspaceAttachmentRepositoryPort,
    private readonly archive: ContentArchiveService,
  ) {}

  async attachGroupToProduct(
    organizationId: string,
    groupId: string,
    productId: string,
  ) {
    const { product, group, generationCount, productWorkspace } =
      await this.repository.loadAttachPreflight({ organizationId, groupId, productId });

    if (!product) throw new NotFoundException('MasterProduct not found');
    if (!group) throw new NotFoundException('Content generation group not found');
    if (generationCount === 0) {
      throw new BadRequestException('Content generation group has no generations');
    }
    if (group.targetMasterId && group.targetMasterId !== productId) {
      throw new BadRequestException('Content generation group is already linked to a different product');
    }

    await this.repository.attachGroupToProduct({
      organizationId,
      groupId,
      productId,
      productWorkspaceId: productWorkspace?.id ?? null,
    });

    return this.archive.listProductWorkspace(organizationId, productId, { page: 1, limit: 100 });
  }
}
