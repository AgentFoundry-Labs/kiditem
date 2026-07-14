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
    const controller = new ContentWorkspaceController(workspaces as never, thumbnails as never);

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
