import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { RegistrableThumbnailPort, RegistrableThumbnailView } from '../port/in/workspace/registrable-thumbnail.port';
import { IMAGE_FETCH_PORT, type ImageFetchPort } from '../port/out/provider/image-fetch.port';
import {
  REGISTRABLE_THUMBNAIL_REPOSITORY_PORT,
  type RegistrableThumbnailRepositoryPort,
} from '../port/out/repository/registrable-thumbnail.repository.port';
import { MAX_FETCH_BYTES, parseDataImageUrl } from '../../domain/thumbnail-image-source';

/**
 * 몰에 올릴 대표이미지 자산과 그 사진을 내준다(KID-313 W3a). 열쇠는 판매 상품과 고른 자산이고, 고르지 않았으면
 * 작업공간의 현재 대표이미지다. 몰 반영 실행은 Channels 가 한다.
 */
@Injectable()
export class RegistrableThumbnailService implements RegistrableThumbnailPort {
  constructor(
    @Inject(REGISTRABLE_THUMBNAIL_REPOSITORY_PORT)
    private readonly repository: RegistrableThumbnailRepositoryPort,
    @Inject(IMAGE_FETCH_PORT)
    private readonly imageFetcher: ImageFetchPort,
  ) {}

  async readRegistrableThumbnail(input: {
    organizationId: string;
    salesProductId: string;
    selectedThumbnailAssetId: string | null;
  }): Promise<RegistrableThumbnailView> {
    const found = await this.findRegistrableThumbnail(input);
    if (!found) throw new NotFoundException('이 판매 상품에 대표이미지가 없습니다 — 대표이미지를 먼저 고르세요');
    return found;
  }

  async findRegistrableThumbnail(input: {
    organizationId: string;
    salesProductId: string;
    selectedThumbnailAssetId: string | null;
  }): Promise<RegistrableThumbnailView | null> {
    const found = await this.repository.findRegistrableAsset({
      organizationId: input.organizationId,
      salesProductId: input.salesProductId,
      assetId: input.selectedThumbnailAssetId,
    });
    if (found.mode === 'foreign_asset') {
      throw new BadRequestException('고른 대표이미지가 이 판매 상품의 이미지가 아닙니다');
    }
    if (found.mode === 'none') return null;
    return {
      assetId: found.asset.assetId,
      contentWorkspaceId: found.asset.contentWorkspaceId,
      salesProductId: input.salesProductId,
      image: { url: found.asset.url, sha256: null },
    };
  }

  async loadThumbnailImage(input: { organizationId: string; assetId: string }) {
    const url = await this.repository.findAssetUrl(input);
    if (!url) throw new NotFoundException(`ContentAsset ${input.assetId} not found`);
    const inline = parseDataImageUrl(url);
    const image = inline
      ? { buffer: Buffer.from(inline.base64, 'base64'), mimeType: inline.mimeType }
      : await this.imageFetcher.fetchTrustedStorageImage(url);
    this.imageFetcher.assertSupportedMime(image.mimeType);
    if (image.buffer.length > MAX_FETCH_BYTES) throw new BadRequestException('image too large');
    const ext = this.imageFetcher.extForMime(image.mimeType);
    return {
      dataUrl: inline ? url : `data:${image.mimeType};base64,${image.buffer.toString('base64')}`,
      filename: `${input.assetId}.${ext}`,
      mimeType: image.mimeType,
      sha256: createHash('sha256').update(image.buffer).digest('hex'),
    };
  }
}
