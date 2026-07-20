import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import {
  COUPANG_KEYWORD_EXTENSION_MIN_VERSION,
  searchCoupangKeywordSuggestions,
} from './coupang-keyword-extension';
import { WING_CATALOG_EXTENSION_RELOAD_REQUIRED } from '../../wing-catalog/lib/wing-catalog-extension';

vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

describe('Coupang keyword extension gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectExtensionId).mockResolvedValue('coupang-extension');
  });

  it('rejects the prior worker before starting keyword suggestions', async () => {
    vi.mocked(sendToExtension).mockResolvedValueOnce({
      success: true,
      version: '1.2.32',
      capabilities: {
        coupangKeywordSuggestions: true,
        coupangProductNameTokens: true,
        browserCollectionSessions: true,
      },
    });

    expect(COUPANG_KEYWORD_EXTENSION_MIN_VERSION).toBe('1.2.33');
    await expect(searchCoupangKeywordSuggestions({ keyword: '문구' }))
      .rejects.toThrow(WING_CATALOG_EXTENSION_RELOAD_REQUIRED);
    expect(sendToExtension).toHaveBeenCalledTimes(1);
  });

  it('starts suggestions only after the compatible collection-session ping', async () => {
    vi.mocked(sendToExtension)
      .mockResolvedValueOnce({
        success: true,
        version: '1.2.33',
        capabilities: {
          coupangKeywordSuggestions: true,
          coupangProductNameTokens: true,
          browserCollectionSessions: true,
        },
      })
      .mockResolvedValueOnce({ success: true, items: [], productNameTokens: [] });

    await expect(searchCoupangKeywordSuggestions({ keyword: '문구' }))
      .resolves.toMatchObject({ success: true, items: [], productNameTokens: [] });
    expect(sendToExtension).toHaveBeenCalledTimes(2);
  });
});
