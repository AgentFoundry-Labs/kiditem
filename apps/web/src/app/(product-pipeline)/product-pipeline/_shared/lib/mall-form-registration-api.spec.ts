import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MallProductDraft } from './mall-product-draft';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
const credentials = vi.hoisted(() => ({ loadMallLoginCredentials: vi.fn() }));

vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionId: bridge.detectOrderCollectionExtensionId,
  sendToExtension: bridge.sendToExtension,
  EXTENSION_TIMEOUT_MESSAGE: 'timeout',
}));
vi.mock('@/lib/mall-login-credentials', () => ({
  loadMallLoginCredentials: credentials.loadMallLoginCredentials,
}));

const { fillMallRegistrationForm } = await import('./mall-form-registration-api');

function draft(): MallProductDraft {
  return {
    candidateId: 'c1',
    displayName: '킬러볼 스피너 키링',
    sellerProductName: '킬러볼 스피너 키링',
    brand: '키드아이템',
    maker: '거영I&D',
    keywords: ['키링'],
    representativeImageUrl: 'https://cdn.test/main.jpg',
    additionalImageUrls: [],
    detailImageUrls: ['https://cdn.test/detail.jpg'],
    notice: { category: '아동용품', fields: { 품명및모델명: '킬러볼 스피너 키링' } },
    variants: [{
      options: [],
      salePrice: 2280,
      listPrice: 2280,
      stock: 10,
      barcode: null,
      sellerSku: null,
      representativeImageUrl: 'https://cdn.test/main.jpg',
    }],
    sourceCategory: null,
  };
}

const form = { url: 'https://item.esmplus.com/goods/new', manualSteps: [] };

function lastMessage(): Record<string, unknown> {
  return bridge.sendToExtension.mock.calls.at(-1)?.[1] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.detectOrderCollectionExtensionId.mockResolvedValue('ext-1');
  bridge.sendToExtension.mockResolvedValue({ ok: true, steps: [], warnings: [], manualSteps: [] });
  credentials.loadMallLoginCredentials.mockResolvedValue(null);
});

/**
 * 폼 자동채움이 확장에 넘기는 것.
 *
 * 몰 키 하나로 통한다 — 계정을 찾는 키도, 확장에 보내는 키도 같은 값이다(KID-250).
 * 어느 폼을 여는지는 확장이 레지스트리의 `formSpec` 으로 정한다. 웹에서도 접으면
 * 접는 규칙이 두 곳이 되고, 한쪽만 고치는 날 조용히 다른 몰의 폼이 열린다.
 */
describe('fillMallRegistrationForm', () => {
  it('⭐ 몰 키 그대로 넘긴다 — 폼을 고르는 것은 확장이다', async () => {
    await fillMallRegistrationForm('domeggook', draft(), form);
    expect(lastMessage()).toMatchObject({
      action: 'registerToMallForm',
      mall: 'domeggook',
      accountKey: 'domeggook',
    });
  });

  /**
   * ESM Plus(`item.esmplus.com`)는 지마켓 판매자 어드민이다. 예전에는 확장 스펙 이름이
   * `esmplus` 라 저장된 계정을 못 찾고 늘 열린 세션에 기댔다. 이제 몰 키 `gmarket` 으로
   * 부르므로 쇼핑몰 계정의 지마켓 아이디·비밀번호로 자동 로그인이 붙는다(사장님 확인
   * 2026-09-17). 옥션은 이 등록 한 번에 함께 올라가므로 따로 로그인하지 않는다.
   */
  it('⭐ ESM Plus 는 지마켓 계정으로 자동 로그인한다', async () => {
    credentials.loadMallLoginCredentials.mockResolvedValue({ loginId: 'seller', password: 'pw' });

    await fillMallRegistrationForm('gmarket', draft(), form);

    expect(credentials.loadMallLoginCredentials).toHaveBeenCalledWith('gmarket');
    expect(lastMessage()).toMatchObject({
      mall: 'gmarket',
      accountKey: 'gmarket',
      credentials: { loginId: 'seller', password: 'pw' },
    });
  });

  it('저장된 계정이 없으면 자격증명 없이 보낸다 — 열린 세션에 기댄다', async () => {
    await fillMallRegistrationForm('gmarket', draft(), form);
    expect(lastMessage()).not.toHaveProperty('credentials');
  });

  it('초안이 비어 있으면 확장을 부르지 않는다 — 반쯤 빈 폼은 사람이 그대로 제출한다', async () => {
    await expect(
      fillMallRegistrationForm('domeggook', { ...draft(), detailImageUrls: [] }, form),
    ).rejects.toThrow(/등록 준비가 끝나지 않았습니다/);
    expect(bridge.sendToExtension).not.toHaveBeenCalled();
  });

  it('폼을 채운 것은 등록이 아니다 — 응답이 어떻든 제출됐다고 말하지 않는다', async () => {
    bridge.sendToExtension.mockResolvedValue({ ok: true, submitted: true });
    const result = await fillMallRegistrationForm('domeggook', draft(), form);
    expect(result.submitted).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('명시한 등록 경로만 [등록] 결과와 상품번호를 분류한다', async () => {
    bridge.sendToExtension.mockResolvedValue({
      ok: true,
      submitted: true,
      accepted: true,
      productNo: 'mall-123',
    });

    const result = await fillMallRegistrationForm('domeggook', draft(), form, { submit: true });

    expect(lastMessage()).toMatchObject({ submit: true });
    expect(result).toMatchObject({ submitted: true, accepted: true, productNo: 'mall-123' });
  });

  it('carries the server execution lease through an explicit submit request', async () => {
    await fillMallRegistrationForm('domeggook', draft(), form, {
      submit: true,
      executionContext: {
        executionId: '11111111-1111-4111-8111-111111111111',
        payloadHash: 'frozen-hash',
        leaseToken: '22222222-2222-4222-8222-222222222222',
      },
    });

    expect(lastMessage()).toMatchObject({
      submit: true,
      executionContext: {
        executionId: '11111111-1111-4111-8111-111111111111',
        payloadHash: 'frozen-hash',
        leaseToken: '22222222-2222-4222-8222-222222222222',
      },
    });
  });
});
