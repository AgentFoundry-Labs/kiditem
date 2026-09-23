import { Inject, Injectable } from '@nestjs/common';
import { REGISTRABLE_THUMBNAIL_PORT, type RegistrableThumbnailPort } from '../../../../content/application/port/in/workspace/registrable-thumbnail.port';
import type { ChannelRegistrableThumbnailPort } from '../../../application/port/out/content/registrable-thumbnail.port';

@Injectable()
export class RegistrableThumbnailAdapter implements ChannelRegistrableThumbnailPort {
  constructor(@Inject(REGISTRABLE_THUMBNAIL_PORT) private readonly content: RegistrableThumbnailPort) {}
  read(input: { organizationId: string; generationId: string }) { return this.content.readRegistrableThumbnail(input); }
  loadImage(input: { organizationId: string; generationId: string; url: string }) { return this.content.loadThumbnailImage(input); }
}
