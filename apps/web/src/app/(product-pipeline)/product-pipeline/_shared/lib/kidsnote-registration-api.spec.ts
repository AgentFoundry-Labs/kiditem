import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MallProductDraft } from './mall-product-draft';

const detectOrderCollectionExtensionId = vi.fn();
const sendToExtension = vi.fn();

vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionId: (...args: unknown[]) => detectOrderCollectionExtensionId(...args),
  sendToExtension: (...args: unknown[]) => sendToExtension(...args),
}));

const { fillKidsnoteRegistrationForm } = await import('./kidsnote-registration-api');

function draft(overrides: Partial<MallProductDraft> = {}): MallProductDraft {
  return {
    candidateId: 'cand-1',
    displayName: '과일바구니 딸깍이 키링',
    sellerProductName: '5000과일바구니딸깍이키링',
    brand: '노브랜드',
    maker: '해피프랜즈',
    keywords: ['키링'],
    representativeImageUrl: 'https://cdn/rep.jpg',
    additionalImageUrls: [],
    detailImageUrls: ['https://cdn/detail.jpg'],
    notice: { category: '어린이제품', fields: { 품명및모델명: '키링', 제조국: '중국' } },
    variants: [{
      options: [{ type: '색상', value: '혼합' }],
      salePrice: 7900,
      listPrice: 9900,
      stock: 999,
      barcode: null,
      sellerSku: null,
      representativeImageUrl: 'https://cdn/rep.jpg',
    }],
    sourceCategory: '완구',
    ...overrides,
  };
}

describe('fillKidsnoteRegistrationForm', () => {
  beforeEach(() => {
    detectOrderCollectionExtensionId.mockReset().mockResolvedValue('ext-1');
    sendToExtension.mockReset().mockResolvedValue({
      ok: true, tabId: 7, steps: ['fields:5/5'], warnings: [], manualSteps: ['배송비 정책을 지정하세요.'],
    });
  });

  it('sends the built form under the kidsnote action', async () => {
    await fillKidsnoteRegistrationForm(draft(), {});
    const [extensionId, message] = sendToExtension.mock.calls[0]!;
    expect(extensionId).toBe('ext-1');
    expect(message).toMatchObject({ action: 'registerToKidsnoteForm' });
    expect(message.form.fields).toMatchObject({ big: '2128', mid: '2129', small: '2504' });
  });

  it('never reports the listing as submitted', async () => {
    // 확장이 무슨 말을 하든 키즈노트 등록은 사람이 누른다.
    sendToExtension.mockResolvedValue({ ok: true, submitted: true, tabId: 7 });
    const result = await fillKidsnoteRegistrationForm(draft(), {});
    expect(result.submitted).toBe(false);
  });

  it('refuses to open a half-empty form', async () => {
    await expect(fillKidsnoteRegistrationForm(draft({ detailImageUrls: [] }), {}))
      .rejects.toThrow(/상세 이미지/);
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('asks for the extension instead of failing silently', async () => {
    detectOrderCollectionExtensionId.mockResolvedValue(null);
    await expect(fillKidsnoteRegistrationForm(draft(), {}))
      .rejects.toThrow(/확장프로그램/);
  });

  it('surfaces the extension error and keeps the manual steps', async () => {
    sendToExtension.mockResolvedValue({ ok: false, error: '상품등록 폼(#prdFrm)이 없습니다.' });
    const result = await fillKidsnoteRegistrationForm(draft(), {});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/#prdFrm/);
    expect(result.manualSteps.some((step) => step.includes('배송'))).toBe(true);
  });
});
