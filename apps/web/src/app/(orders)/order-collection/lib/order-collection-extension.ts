import {
  detectOrderCollectionExtensionId,
  sendToExtension,
} from '@/lib/extension-bridge';

export interface IcecreamMallExtensionRows {
  mall: '아이스크림몰';
  date: string | null;
  headers: string[];
  rows: string[][];
  rowCount: number;
  masked: boolean;
  source: string;
  url?: string;
}

interface IcecreamMallExtensionResponse extends Partial<IcecreamMallExtensionRows> {
  success?: boolean;
  pendingLogin?: boolean;
  error?: string;
}

export async function collectIcecreamMallRowsFromExtension(
  date: string,
): Promise<IcecreamMallExtensionRows> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector를 Chrome에서 로드한 뒤 다시 시도해주세요.',
    );
  }

  const response = await sendToExtension<IcecreamMallExtensionResponse>(extensionId, {
    action: 'collectIcecreamMallOrders',
    date,
  }, 45000);

  if (!response?.success || !response.headers || !response.rows) {
    throw new Error(
      response?.error ??
        (response?.pendingLogin
          ? '아이스크림몰 로그인 후 배송 조회 화면을 열어주세요.'
          : '아이스크림몰 주문 수집 실패'),
    );
  }

  return {
    mall: '아이스크림몰',
    date: response.date ?? date,
    headers: response.headers,
    rows: response.rows,
    rowCount: response.rowCount ?? response.rows.length,
    masked: response.masked ?? false,
    source: response.source ?? 'icecream-mall-delivery-grid',
    url: response.url,
  };
}
