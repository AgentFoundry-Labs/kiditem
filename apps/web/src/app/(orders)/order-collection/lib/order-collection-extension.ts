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

export interface IcecreamMallExtensionCredentials {
  loginId: string;
  password: string;
}

interface IcecreamMallExtensionResponse extends Partial<IcecreamMallExtensionRows> {
  success?: boolean;
  pendingLogin?: boolean;
  error?: string;
}

export async function collectIcecreamMallRowsFromExtension(
  date: string,
  credentials?: IcecreamMallExtensionCredentials,
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
    credentials,
  }, 90000);

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

/**
 * 수집 전 자동 로그인 보장(선택). 저장된 계정이 있으면 확장이 백그라운드로 해당 몰에 로그인해둔다.
 * 실패해도 조용히 넘어감 — 로그인 안 되면 뒤이은 수집 단계가 "로그인 필요"로 안내한다.
 */
export async function ensureMallLoggedInViaExtension(
  mallKey: string,
  credentials: IcecreamMallExtensionCredentials,
): Promise<void> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) return;
  try {
    await sendToExtension(extensionId, { action: 'ensureMallLoggedIn', mallKey, credentials }, 45000);
  } catch {
    /* 자동 로그인 실패 — 수집 단계에서 로그인 필요 메시지로 안내됨 */
  }
}

export interface SellpiaSendResult {
  success: boolean;
  submitted?: boolean;
  shop?: string;
  fileName?: string;
  url?: string;
  error?: string;
}

/**
 * 셀피아 order_collect 화면에 판매처 선택 + 변환 파일 주입 + 주문접수 클릭까지 자동화.
 * shopName 은 몰 이름(예: '아이스크림몰') — 확장프로그램이 셀피아 판매처 옵션 텍스트와 매칭한다.
 */
export async function sendOrderFileToSellpiaViaExtension(params: {
  shopName: string;
  fileName: string;
  blob: Blob;
}): Promise<SellpiaSendResult> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector를 Chrome에서 로드한 뒤 다시 시도해주세요.',
    );
  }

  const fileBase64 = await blobToBase64(params.blob);
  const response = await sendToExtension<SellpiaSendResult>(
    extensionId,
    {
      action: 'sendOrderFileToSellpia',
      shopName: params.shopName,
      fileName: params.fileName,
      fileBase64,
    },
    60000,
  );

  if (!response?.success) {
    throw new Error(response?.error ?? '셀피아 전송에 실패했습니다.');
  }
  return response;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });
  const base64 = dataUrl.split(',')[1];
  if (!base64) throw new Error('파일 인코딩에 실패했습니다.');
  return base64;
}
