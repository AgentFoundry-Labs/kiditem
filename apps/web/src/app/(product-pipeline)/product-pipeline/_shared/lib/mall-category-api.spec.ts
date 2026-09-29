import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-bridge', () => bridge);

import { listMallCategories } from './mall-category-api';

describe('listMallCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.detectOrderCollectionExtensionId.mockResolvedValue('ext');
  });

  it('finds the extension by the new runtime category read capability', async () => {
    bridge.sendToExtension.mockResolvedValue({
      success: true,
      categories: [{ id: '유아', name: '유아', hasChildren: true }],
    });
    await listMallCategories('onch', []);
    expect(bridge.detectOrderCollectionExtensionId).toHaveBeenCalledWith(1200, 'mallCategoryReadV1');
  });
});
