import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ContentWorkspaceThumbnailSelectionService } from './content-workspace-thumbnail-selection.service';
import type { ContentWorkspaceThumbnailSelectionRepositoryPort } from '../port/out/repository/content-workspace-thumbnail-selection.repository.port';

function setup() {
  const repository = {
    assertActiveWorkspace: vi.fn().mockResolvedValue(undefined),
    // 기본값은 "우리가 가진 URL 이 아님" — 진짜 외부 URL 경로가 그대로 유지된다.
    findOwnedAssetIdByUrl: vi.fn().mockResolvedValue(null),
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

  // 워크스페이스 썸네일 갤러리가 방금 만든 자산을 대표로 고르면 URL 이 그대로 넘어온다.
  // 그 URL 은 우리 오브젝트 스토리지 주소이므로 다시 내려받으면 안 된다. 로컬 MinIO 는
  // `http://localhost:9000/...` 이라 SSRF 가드에 막혀 400 이 났고, 그게 `대표 썸네일 등록`
  // 이 조용히 실패하던 마지막 원인이었다.
  it('adopts an already-owned storage URL without re-fetching it', async () => {
    const { service, repository, fetcher, storage } = setup();
    (repository.findOwnedAssetIdByUrl as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce('asset-owned-1');

    await service.setCurrent({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      selection: { externalUrl: 'http://localhost:9000/kiditem/thumb.png' },
    });

    expect(fetcher.fetchImage).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
    expect(repository.selectCurrent).toHaveBeenCalledWith({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      selection: { kind: 'content_asset', contentAssetId: 'asset-owned-1' },
    });
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
