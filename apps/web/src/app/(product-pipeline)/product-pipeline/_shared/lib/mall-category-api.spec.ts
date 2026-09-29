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

  it('asks one level in the shared shape and returns the category names', async () => {
    bridge.sendToExtension.mockResolvedValue({
      success: true,
      categories: [
        { id: '장난감', name: '장난감', hasChildren: true },
        { id: '교구', name: '교구', hasChildren: false },
      ],
    });
    await expect(listMallCategories('onch', ['유아'])).resolves.toEqual(['장난감', '교구']);
    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'ext',
      { action: 'listMallCategories', mall: 'onch', path: ['유아'] },
      15000,
    );
  });

  it('shows the shared failure envelope reason and rejects an answer outside the contract', async () => {
    bridge.sendToExtension.mockResolvedValueOnce({ success: false, errorCode: 'SITE_LOGIN_REQUIRED', error: '온채널에 로그인해 주세요.' });
    await expect(listMallCategories('onch', [])).rejects.toThrow('온채널에 로그인해 주세요.');
    bridge.sendToExtension.mockResolvedValueOnce({ ok: true, names: ['유아'] });
    await expect(listMallCategories('onch', [])).rejects.toThrow('확장 답이 약속한 모양과 다릅니다');
  });
});
