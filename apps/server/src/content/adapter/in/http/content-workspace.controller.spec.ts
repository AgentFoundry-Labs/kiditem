import { describe, expect, it, vi } from 'vitest';
import { ContentWorkspaceController } from './content-workspace.controller';
import type { CreateManualDetailPageResult } from '../../../application/port/in/workspace/registration-content-workspace.port';

describe('ContentWorkspaceController current thumbnail', () => {
  it('adopts one asset of the session organization workspace', async () => {
    const contentAssets = {
      adoptCurrentThumbnail: vi.fn().mockResolvedValue({ id: 'asset-1', isCurrentThumbnail: true }),
    };
    const controller = new ContentWorkspaceController({} as never, contentAssets as never, {} as never);

    await expect(controller.selectCurrentThumbnail('org-1', 'workspace-1', { assetId: 'asset-1' }))
      .resolves.toMatchObject({ id: 'asset-1', isCurrentThumbnail: true });
    expect(contentAssets.adoptCurrentThumbnail).toHaveBeenCalledWith({
      organizationId: 'org-1',
      contentWorkspaceId: 'workspace-1',
      assetId: 'asset-1',
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
    const controller = new ContentWorkspaceController({} as never, contentAssets as never, {} as never);

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
    const controller = new ContentWorkspaceController(workspaces as never, contentAssets as never, {} as never);

    await expect(controller.getForSalesProduct('org-1', 'product-1')).resolves.toEqual({ workspace: null });
    expect(workspaces.getForSalesProduct).toHaveBeenCalledWith('org-1', 'product-1');
    await expect(controller.getRegistrationMediaForSalesProduct('org-1', 'product-1')).resolves.toEqual(media);
    expect(contentAssets.loadRegistrationMedia).toHaveBeenCalledWith({ organizationId: 'org-1', salesProductId: 'product-1' });
  });
});

describe('ContentWorkspaceController manual first detail page', () => {
  it('writes the first detail page for the session organization and user only', async () => {
    const registrationContent = {
      createManualDetailPage: vi.fn<(input: unknown) => Promise<CreateManualDetailPageResult>>().mockResolvedValue({ workspaceId: 'w-1', revisionId: 'r-1', detailPageId: 'd-1' }),
    };
    const controller = new ContentWorkspaceController({} as never, {} as never, registrationContent as never);

    await expect(controller.createManualDetailPage('org-1', 'product-1', { id: 'user-1' } as never, { html: '<p>상세</p>' }))
      .resolves.toEqual({ workspaceId: 'w-1', revisionId: 'r-1', detailPageId: 'd-1' });
    expect(registrationContent.createManualDetailPage).toHaveBeenCalledWith({
      organizationId: 'org-1', salesProductId: 'product-1', html: '<p>상세</p>', createdByUserId: 'user-1',
    });
  });
});
