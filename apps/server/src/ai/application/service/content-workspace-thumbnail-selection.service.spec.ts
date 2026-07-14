import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ContentWorkspaceThumbnailSelectionService } from './content-workspace-thumbnail-selection.service';
import type { ContentWorkspaceThumbnailSelectionRepositoryPort } from '../port/out/repository/content-workspace-thumbnail-selection.repository.port';

function setup() {
  const repository = {
    assertActiveWorkspace: vi.fn().mockResolvedValue(undefined),
    selectCurrent: vi.fn().mockResolvedValue({
      selectionId: 'selection-1',
      contentAssetId: 'asset-1',
      url: 'https://cdn.example.com/thumb.png',
    }),
  } as unknown as ContentWorkspaceThumbnailSelectionRepositoryPort;
  const fetcher = {
    fetchImage: vi.fn().mockResolvedValue({
      buffer: Buffer.from('png'),
      mimeType: 'image/png',
      storageKey: null,
    }),
    fetchTrustedStorageImage: vi.fn(),
    assertSupportedMime: vi.fn(),
    extForMime: vi.fn().mockReturnValue('png'),
  };
  const storage = {
    save: vi.fn().mockResolvedValue('https://cdn.example.com/thumb.png'),
    copy: vi.fn(),
    delete: vi.fn(),
    extractKey: vi.fn().mockReturnValue('content-assets/org-1/workspace-1/thumbnail.png'),
  };
  return {
    service: new ContentWorkspaceThumbnailSelectionService(
      repository,
      fetcher,
      storage,
    ),
    repository,
    fetcher,
    storage,
  };
}

describe('ContentWorkspaceThumbnailSelectionService', () => {
  it('selects an existing managed asset without copying its binary', async () => {
    const { service, repository, fetcher, storage } = setup();

    await service.setCurrent({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      selection: { contentAssetId: 'asset-1' },
    });

    expect(repository.selectCurrent).toHaveBeenCalledWith({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      selection: { kind: 'content_asset', contentAssetId: 'asset-1' },
    });
    expect(fetcher.fetchImage).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('requires generation and candidate provenance together', async () => {
    const { service } = setup();

    await expect(service.setCurrent({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: null,
      selection: { sourceThumbnailGenerationId: 'generation-1' },
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fetches and stores an external URL before adopting the managed asset', async () => {
    const { service, repository, fetcher, storage } = setup();

    await service.setCurrent({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      selection: { externalUrl: 'https://images.example.com/source.png' },
    });

    expect(fetcher.fetchImage).toHaveBeenCalledWith('https://images.example.com/source.png');
    expect(storage.save).toHaveBeenCalledWith(
      expect.stringMatching(/^content-assets\/org-1\/workspace-1\/thumbnail-[a-f0-9]{64}\.png$/),
      Buffer.from('png'),
      'image/png',
    );
    expect(repository.selectCurrent).toHaveBeenCalledWith({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      selection: {
        kind: 'external',
        url: 'https://cdn.example.com/thumb.png',
        storageKey: 'content-assets/org-1/workspace-1/thumbnail.png',
        mimeType: 'image/png',
        fileSize: 3,
      },
    });
  });

  it('preflights the owned active workspace before fetching an external URL', async () => {
    const { service, repository, fetcher, storage } = setup();
    repository.assertActiveWorkspace.mockRejectedValueOnce(
      new NotFoundException('Content workspace not found.'),
    );

    await expect(service.setCurrent({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      selection: { externalUrl: 'https://images.example.com/source.png' },
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.assertActiveWorkspace).toHaveBeenCalledWith({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
    });
    expect(fetcher.fetchImage).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
    expect(repository.selectCurrent).not.toHaveBeenCalled();
  });

  it('rejects mixed selection sources before any IO', async () => {
    const { service, repository, fetcher } = setup();

    await expect(service.setCurrent({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: null,
      selection: {
        contentAssetId: 'asset-1',
        externalUrl: 'https://images.example.com/source.png',
      },
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.selectCurrent).not.toHaveBeenCalled();
    expect(fetcher.fetchImage).not.toHaveBeenCalled();
  });
});
