import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  CONTENT_WORKSPACE_THUMBNAIL_SELECTION_REPOSITORY_PORT,
  type ContentWorkspaceThumbnailSelectionRepositoryPort,
  type ContentWorkspaceThumbnailSelectionSource,
} from '../port/out/repository/content-workspace-thumbnail-selection.repository.port';
import {
  IMAGE_FETCH_PORT,
  type ImageFetchPort,
} from '../port/out/provider/image-fetch.port';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../port/out/storage/image-storage.port';

export interface SetCurrentWorkspaceThumbnailInput {
  organizationId: string;
  workspaceId: string;
  userId: string | null;
  selection: {
    contentAssetId?: string;
    sourceThumbnailGenerationId?: string;
    sourceThumbnailCandidateId?: string;
    externalUrl?: string;
  };
}

@Injectable()
export class ContentWorkspaceThumbnailSelectionService {
  constructor(
    @Inject(CONTENT_WORKSPACE_THUMBNAIL_SELECTION_REPOSITORY_PORT)
    private readonly repository: ContentWorkspaceThumbnailSelectionRepositoryPort,
    @Inject(IMAGE_FETCH_PORT)
    private readonly imageFetch: ImageFetchPort,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly imageStorage: ImageStoragePort,
  ) {}

  async setCurrent(input: SetCurrentWorkspaceThumbnailInput) {
    this.assertValidSelection(input.selection);
    await this.repository.assertActiveWorkspace({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
    });
    const selection = await this.prepareSelection(input);
    return this.repository.selectCurrent({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      selection,
    });
  }

  private async prepareSelection(
    input: SetCurrentWorkspaceThumbnailInput,
  ): Promise<ContentWorkspaceThumbnailSelectionSource> {
    const { selection } = input;
    const hasAsset = Boolean(selection.contentAssetId);
    const hasGeneration = Boolean(
      selection.sourceThumbnailGenerationId || selection.sourceThumbnailCandidateId,
    );
    if (hasAsset) {
      return { kind: 'content_asset', contentAssetId: selection.contentAssetId! };
    }
    if (hasGeneration) {
      return {
        kind: 'generation_candidate',
        sourceThumbnailGenerationId: selection.sourceThumbnailGenerationId!,
        sourceThumbnailCandidateId: selection.sourceThumbnailCandidateId!,
      };
    }

    const sourceUrl = selection.externalUrl!;
    const fetched = await this.imageFetch.fetchImage(sourceUrl);
    this.imageFetch.assertSupportedMime(fetched.mimeType);
    const extension = this.imageFetch.extForMime(fetched.mimeType);
    const hash = createHash('sha256').update(sourceUrl).digest('hex');
    const key = `content-assets/${input.organizationId}/${input.workspaceId}/thumbnail-${hash}.${extension}`;
    const url = await this.imageStorage.save(key, fetched.buffer, fetched.mimeType);
    return {
      kind: 'external',
      url,
      storageKey: this.imageStorage.extractKey(url),
      mimeType: fetched.mimeType,
      fileSize: fetched.buffer.length,
    };
  }

  private assertValidSelection(
    selection: SetCurrentWorkspaceThumbnailInput['selection'],
  ): void {
    const hasAsset = Boolean(selection.contentAssetId);
    const hasExternal = Boolean(selection.externalUrl);
    const hasGeneration = Boolean(
      selection.sourceThumbnailGenerationId || selection.sourceThumbnailCandidateId,
    );
    if (Number(hasAsset) + Number(hasExternal) + Number(hasGeneration) !== 1) {
      throw new BadRequestException('Select exactly one thumbnail source.');
    }
    if (hasGeneration) {
      if (!selection.sourceThumbnailGenerationId || !selection.sourceThumbnailCandidateId) {
        throw new BadRequestException('Thumbnail generation and candidate IDs are required together.');
      }
    }
  }
}
