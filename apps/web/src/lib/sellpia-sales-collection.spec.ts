import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSellpiaSalesCacheFromExtension,
  collectSellpiaSaleSummaryFromExtension,
  readSellpiaSalesCacheFromExtension,
} from './sellpia-sales-collection';

const mocks = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => mocks);

describe('Sellpia sales extension cache', () => {
  const provenance = {
    source: 'sellpia_sale_summary',
    mode: 'selldate',
    sellerScope: 'all',
    responseShape: 'empty_object',
    explicitEmpty: true,
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detectOrderCollectionExtensionId.mockResolvedValue('order-collector');
  });

  it('rejects an old extension empty response without authoritative provenance', async () => {
    mocks.sendToExtension.mockResolvedValue({
      success: true,
      payload: { range: { from: '2026-07-18', to: '2026-07-18' }, sellers: [] },
    });

    await expect(collectSellpiaSaleSummaryFromExtension({
      organizationId: 'org-1',
    })).rejects.toThrow('응답 형식이 올바르지 않습니다');
  });

  it('stamps a proven explicit-empty response with the live collection time', async () => {
    mocks.sendToExtension.mockResolvedValue({
      success: true,
      payload: {
        range: { from: '2026-07-18', to: '2026-07-18' },
        sellers: [],
        provenance,
      },
    });

    const result = await collectSellpiaSaleSummaryFromExtension({ organizationId: 'org-1' });

    expect(mocks.sendToExtension).toHaveBeenCalledWith(
      'order-collector',
      expect.objectContaining({
        action: 'collectSellpiaSaleSummary',
        organizationId: 'org-1',
      }),
      90000,
    );
    expect(mocks.detectOrderCollectionExtensionId).toHaveBeenCalledTimes(1);
    expect(mocks.detectOrderCollectionExtensionId).toHaveBeenCalledWith(
      1200,
      'collectSellpiaSaleSummaryAuthoritativeV1',
    );
    expect(result.provenance).toEqual(provenance);
    expect(result.capturedAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(result.capturedAt))).toBe(false);
  });

  it('validates a cached payload before returning it to the ingest path', async () => {
    mocks.sendToExtension.mockResolvedValue({
      success: true,
      cache: {
        organizationId: 'org-1',
        capturedAt: 1_752_837_600_000,
        payload: { range: { from: '2026-06-31', to: '2026-07-18' }, sellers: [] },
      },
    });

    await expect(readSellpiaSalesCacheFromExtension('org-1')).rejects.toThrow(
      '캐시 형식이 올바르지 않습니다',
    );
  });

  it('rejects a finite timestamp outside the JavaScript date range', async () => {
    mocks.sendToExtension.mockResolvedValue({
      success: true,
      cache: {
        organizationId: 'org-1',
        capturedAt: Number.MAX_VALUE,
        payload: { range: { from: '2026-07-18', to: '2026-07-18' }, sellers: [] },
      },
    });

    await expect(readSellpiaSalesCacheFromExtension('org-1')).rejects.toThrow(
      '캐시 형식이 올바르지 않습니다',
    );
  });

  it('returns a valid zero-sales cache as an authoritative collection result', async () => {
    const payload = {
      range: { from: '2026-07-18', to: '2026-07-18' },
      sellers: [],
      provenance,
    };
    mocks.sendToExtension.mockResolvedValue({
      success: true,
      cache: {
        organizationId: 'org-1',
        capturedAt: 1_752_837_600_000,
        payload,
      },
    });

    await expect(readSellpiaSalesCacheFromExtension('org-1')).resolves.toEqual({
      capturedAt: 1_752_837_600_000,
      payload: {
        ...payload,
        capturedAt: new Date(1_752_837_600_000).toISOString(),
      },
    });
  });

  it('rejects an ambiguous zero-sales cache before the ingest path', async () => {
    mocks.sendToExtension.mockResolvedValue({
      success: true,
      cache: {
        organizationId: 'org-1',
        capturedAt: 1_752_837_600_000,
        payload: { range: { from: '2026-07-18', to: '2026-07-18' }, sellers: [] },
      },
    });

    await expect(readSellpiaSalesCacheFromExtension('org-1')).rejects.toThrow(
      '캐시 형식이 올바르지 않습니다',
    );
  });

  it('rejects a cache envelope bound to another organization', async () => {
    mocks.sendToExtension.mockResolvedValue({
      success: true,
      cache: {
        organizationId: 'org-2',
        capturedAt: 1_752_837_600_000,
        payload: {
          range: { from: '2026-07-18', to: '2026-07-18' },
          sellers: [],
        },
      },
    });

    await expect(readSellpiaSalesCacheFromExtension('org-1')).rejects.toThrow(
      '다른 조직',
    );
  });

  it('surfaces an extension-side cache cleanup failure', async () => {
    mocks.sendToExtension.mockResolvedValue({
      success: false,
      error: 'storage unavailable',
    });

    await expect(clearSellpiaSalesCacheFromExtension('org-1')).rejects.toThrow(
      'storage unavailable',
    );
  });
});
