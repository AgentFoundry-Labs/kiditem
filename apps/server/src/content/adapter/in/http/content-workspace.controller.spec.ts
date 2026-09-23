import { describe, expect, it, vi } from 'vitest';
import { ContentWorkspaceController } from './content-workspace.controller';

describe('ContentWorkspaceController current thumbnail', () => {
  it('passes organization/workspace/user ownership and the exact selection body to the service', async () => {
    const workspaces = {};
    const thumbnails = {
      setCurrent: vi.fn().mockResolvedValue({
        selectionId: 'selection-1',
        contentAssetId: 'asset-1',
        url: 'https://cdn.example.com/thumb.png',
      }),
    };
    const controller = new ContentWorkspaceController(
      workspaces as never,
      thumbnails as never,
      {} as never,
    );

    await expect(controller.selectCurrentThumbnail(
      'org-1',
      'workspace-1',
      { id: 'user-1' } as never,
      { contentAssetId: 'asset-1' },
    )).resolves.toMatchObject({ contentAssetId: 'asset-1' });
    expect(thumbnails.setCurrent).toHaveBeenCalledWith({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      selection: { contentAssetId: 'asset-1' },
    });
  });
});

describe('ContentWorkspaceController thumbnail gallery', () => {
  it('scopes the gallery replace to the session organization and workspace', async () => {
    const contentAssets = {
      replaceWorkspaceThumbnailGallery: vi.fn().mockResolvedValue({
        thumbnailUrls: ['https://cdn.example.com/a.png'],
      }),
    };
    const controller = new ContentWorkspaceController(
      {} as never,
      {} as never,
      contentAssets as never,
    );

    await expect(controller.replaceThumbnailGallery(
      'org-1',
      'workspace-1',
      { id: 'user-1' } as never,
      { thumbnailUrls: ['https://cdn.example.com/a.png'] },
    )).resolves.toEqual({ thumbnailUrls: ['https://cdn.example.com/a.png'] });
    expect(contentAssets.replaceWorkspaceThumbnailGallery).toHaveBeenCalledWith({
      organizationId: 'org-1',
      contentWorkspaceId: 'workspace-1',
      createdByUserId: 'user-1',
      thumbnailUrls: ['https://cdn.example.com/a.png'],
    });
  });
});

describe('ContentWorkspaceController draft lookups', () => {
  it('reads the draft workspace and its registration media by sales product within the session organization', async () => {
    const workspaces = { getForSalesProduct: vi.fn().mockResolvedValue({ workspace: null }) };
    const media = { registrationImages: { primary: [], thumbnail: ['https://cdn.example.com/t.png'], detail: [] }, currentThumbnail: null };
    const contentAssets = { loadRegistrationMedia: vi.fn().mockResolvedValue(media) };
    const controller = new ContentWorkspaceController(workspaces as never, {} as never, contentAssets as never);

    await expect(controller.getForSalesProduct('org-1', 'product-1')).resolves.toEqual({ workspace: null });
    expect(workspaces.getForSalesProduct).toHaveBeenCalledWith('org-1', 'product-1');
    await expect(controller.getRegistrationMediaForSalesProduct('org-1', 'product-1')).resolves.toEqual(media);
    expect(contentAssets.loadRegistrationMedia).toHaveBeenCalledWith({ organizationId: 'org-1', salesProductId: 'product-1' });
  });
});
