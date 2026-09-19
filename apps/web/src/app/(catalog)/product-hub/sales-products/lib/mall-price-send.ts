import {
  detectOrderCollectionExtensionId,
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from '@/lib/extension-bridge';

/**
 * 몰 가격 보내기(KID-247) — 판매상품 화면에서 사람이 누른 가격만 확장이 그 몰 관리자에 보내고, 몰을 다시 읽어 확인한다.
 * 보냈다(`sent`)와 몰에서 확인했다(`confirmed`)는 다르다.
 */

/** 가격을 보낼 수 있는 몰. 확장 `mall-availability-send.js` 의 `PRICE_MALL_KEYS` 와 같아야 한다. */
export const MALL_PRICE_SEND_MALLS = ['kakao'] as const;

export function canSendMallPrice(mallKey: string): boolean {
  return (MALL_PRICE_SEND_MALLS as readonly string[]).includes(mallKey);
}

const PRICE_CAPABILITY = 'mallPriceSendV1';
const SEND_TIMEOUT_MS = 180_000;

export interface MallPriceSendResult {
  sent: number;
  failed: number;
  confirmed: number;
  results: { code: string; before: number | null; after: number | null; confirmed: boolean }[];
  warnings: string[];
}

interface SendResponse extends Partial<MallPriceSendResult> {
  success?: boolean;
  error?: string;
}

/**
 * `ifPrice` 는 화면이 본 지금 몰 가격(몰 상품을 가져올 때 읽은 값)이다. 주면 몰 가격이 그 값일 때만 보낸다 — 그사이 몰에서
 * 바뀐 가격을 모르고 덮어쓰지 않게.
 */
export async function sendMallPrice(
  mallKey: string,
  items: readonly { code: string; price: number; ifPrice?: number | null }[],
): Promise<MallPriceSendResult> {
  if (!canSendMallPrice(mallKey)) throw new Error('이 몰은 아직 가격을 보낼 수 없습니다.');
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error('확장프로그램이 필요합니다. KidItem 확장을 켜고 그 몰 관리자에 로그인한 뒤 다시 보내세요.');
  }
  const runtime = await detectOrderCollectionExtensionRuntime(1200, [PRICE_CAPABILITY]);
  if (runtime.status !== 'ready') {
    throw new Error(
      `설치된 KidItem 확장${runtime.status === 'incompatible' ? `(${runtime.version})` : ''}이 가격 보내기를 모릅니다. `
      + 'chrome://extensions 에서 확장을 새로고침한 뒤 이 페이지도 새로고침(F5)하고 다시 보내세요.',
    );
  }
  let response: SendResponse;
  try {
    response = await sendToExtension<SendResponse>(
      extensionId,
      {
        action: 'sendMallPrice',
        mallKey,
        items: items.map((item) => ({ code: item.code, price: item.price, ifPrice: item.ifPrice ?? null })),
      },
      SEND_TIMEOUT_MS,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/message port closed/i.test(message)) {
      throw new Error('설치된 확장이 아직 가격 보내기를 모릅니다. chrome://extensions 에서 KidItem 확장을 새로고침하세요.');
    }
    throw error;
  }
  if (response?.success !== true) throw new Error(response?.error ?? '가격을 보내지 못했습니다.');
  return {
    sent: response.sent ?? 0,
    failed: response.failed ?? 0,
    confirmed: response.confirmed ?? 0,
    results: response.results ?? [],
    warnings: response.warnings ?? [],
  };
}
