import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { RegistrableThumbnailPort, RegistrableThumbnailView } from '../port/in/workspace/registrable-thumbnail.port';
import { IMAGE_FETCH_PORT, type ImageFetchPort } from '../port/out/provider/image-fetch.port';
import {
  REGISTRABLE_THUMBNAIL_REPOSITORY_PORT,
  type RegistrableThumbnailRepositoryPort,
} from '../port/out/repository/registrable-thumbnail.repository.port';
import { MAX_FETCH_BYTES, parseDataImageUrl } from '../../domain/thumbnail-image-source';
import { pickRegistrationImageUrl } from '../../domain/registrable-thumbnail';

/** 승인된 생성 썸네일과 그 사진을 내준다. 몰 반영 실행은 Channels 가 한다. */
@Injectable()
export class RegistrableThumbnailService implements RegistrableThumbnailPort {
  constructor(
    @Inject(REGISTRABLE_THUMBNAIL_REPOSITORY_PORT)
    private readonly repository: RegistrableThumbnailRepositoryPort,
    @Inject(IMAGE_FETCH_PORT)
    private readonly imageFetcher: ImageFetchPort,
  ) {}

  async readRegistrableThumbnail(input: { organizationId: string; generationId: string }): Promise<RegistrableThumbnailView> {
    const { organizationId, generationId } = input;
    const generation = await this.repository.findGeneration(generationId, organizationId);
    if (!generation) throw new NotFoundException(`ThumbnailGeneration ${generationId} not found`);

    const url = pickRegistrationImageUrl(generation);
    if (!url) throw new NotFoundException('Generation not found or no selected image');

    const workspace = await this.repository.findRegistrableWorkspace(generation.contentWorkspaceId, organizationId);
    if (!workspace) throw new NotFoundException(`ContentWorkspace ${generation.contentWorkspaceId} not found`);

    return {
      generationId,
      contentWorkspaceId: generation.contentWorkspaceId,
      salesProductId: workspace.salesProductId,
      channelListingId: workspace.channelListingId,
      workspaceDisplayName: workspace.displayName,
      image: { url, assetId: url === generation.selectedUrl ? generation.selectedAssetId : null },
    };
  }

  async loadThumbnailImage(input: { organizationId: string; generationId: string; url: string }) {
    const inline = parseDataImageUrl(input.url);
    const image = inline
      ? { buffer: Buffer.from(inline.base64, 'base64'), mimeType: inline.mimeType }
      : await this.imageFetcher.fetchTrustedStorageImage(input.url);
    this.imageFetcher.assertSupportedMime(image.mimeType);
    if (image.buffer.length > MAX_FETCH_BYTES) throw new BadRequestException('image too large');
    const ext = this.imageFetcher.extForMime(image.mimeType);
    return {
      dataUrl: inline ? input.url : `data:${image.mimeType};base64,${image.buffer.toString('base64')}`,
      filename: `${input.generationId}.${ext}`,
      mimeType: image.mimeType,
      sha256: createHash('sha256').update(image.buffer).digest('hex'),
    };
  }
}
