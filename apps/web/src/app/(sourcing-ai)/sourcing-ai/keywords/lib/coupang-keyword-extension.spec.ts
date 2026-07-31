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

vi.mock('@/lib/browser-collection-session', () => ({
  issueBrowserCollectionRunId: vi.fn().mockResolvedValue(
    '11111111-1111-4111-8111-111111111111',
  ),
}));

describe('Coupang keyword extension gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectExtensionId).mockResolvedValue('coupang-extension');
  });

  it('rejects the prior worker before starting keyword suggestions', async () => {
    vi.mocked(sendToExtension).mockResolvedValueOnce({
      success: true,
      version: '0.9.9',
      capabilities: {
        coupangKeywordSuggestions: true,
        coupangProductNameTokens: true,
        browserCollectionSessions: true,
      },
    });

    expect(COUPANG_KEYWORD_EXTENSION_MIN_VERSION).toBe('1.0.0');
    await expect(searchCoupangKeywordSuggestions({ keyword: '문구' }))
      .rejects.toThrow(WING_CATALOG_EXTENSION_RELOAD_REQUIRED);
    expect(sendToExtension).toHaveBeenCalledTimes(1);
  });

  it('starts suggestions only after the compatible collection-session ping', async () => {
    vi.mocked(sendToExtension)
      .mockResolvedValueOnce({
        success: true,
        version: '1.0.2',
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
