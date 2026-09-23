import { Inject, Injectable } from '@nestjs/common';
import { REGISTRABLE_THUMBNAIL_PORT, type RegistrableThumbnailPort } from '../../../../content/application/port/in/workspace/registrable-thumbnail.port';
import type { ChannelRegistrableThumbnailPort } from '../../../application/port/out/content/registrable-thumbnail.port';

type ReadInput = { organizationId: string; salesProductId: string; selectedThumbnailAssetId: string | null };

@Injectable()
export class RegistrableThumbnailAdapter implements ChannelRegistrableThumbnailPort {
  constructor(@Inject(REGISTRABLE_THUMBNAIL_PORT) private readonly content: RegistrableThumbnailPort) {}
  read(input: ReadInput) { return this.content.readRegistrableThumbnail(input); }
  find(input: ReadInput) { return this.content.findRegistrableThumbnail(input); }
  loadImage(input: { organizationId: string; assetId: string }) { return this.content.loadThumbnailImage(input); }
  readCurrentAssetIds(input: { organizationId: string; salesProductIds: readonly string[] }) { return this.content.readCurrentThumbnailAssetIds(input); }
}
