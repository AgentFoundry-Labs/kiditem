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

export interface OrderCollectionExtensionRun {
  runId: string;
  extensionId?: string;
  date?: string | null;
  signal?: AbortSignal;
}

export interface MallLoginEnsureResult {
  success: boolean;
  submitted?: boolean;
  pendingLogin?: boolean;
  error?: string;
}

export async function finalizeOrderCollectionSession(
  run: OrderCollectionExtensionRun,
  status: 'succeeded' | 'failed',
  message: string,
) {
  const extensionId = run.extensionId ?? await detectOrderCollectionSessionExtension();
  if (!extensionId) return null;
  return sendToExtension(extensionId, {
    action: 'finalizeCollectionSession',
    runId: run.runId,
    status,
    message: message.slice(0, 300),
  });
}

export async function detectOrderCollectionSessionExtension(): Promise<string | null> {
  return detectOrderCollectionExtensionId(1200, 'browserCollectionSessions');
}

export async function collectIcecreamMallRowsFromExtension(
  date: string,
  credentials?: IcecreamMallExtensionCredentials,
  run?: OrderCollectionExtensionRun,
): Promise<IcecreamMallExtensionRows> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionSessionExtension();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector를 Chrome에서 로드한 뒤 다시 시도해주세요.',
    );
  }

  const response = await sendToExtension<IcecreamMallExtensionResponse>(extensionId, {
    action: 'collectIcecreamMallOrders',
    date,
    credentials,
    runId: run?.runId ?? globalThis.crypto.randomUUID(),
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
 * 로그인 보장 결과를 호출자에게 돌려줘 수집을 계속할지 명시적으로 결정하게 한다.
 */
export async function ensureMallLoggedInViaExtension(
  mallKey: string,
  credentials: IcecreamMallExtensionCredentials,
  run?: OrderCollectionExtensionRun,
): Promise<MallLoginEnsureResult> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionSessionExtension();
  if (!extensionId) {
    return {
      success: false,
      pendingLogin: true,
      error: '주문수집 확장프로그램을 찾을 수 없습니다.',
    };
  }
  try {
    const response = await sendToExtension<MallLoginEnsureResult>(
      extensionId,
      {
        action: 'ensureMallLoggedIn',
        mallKey,
        credentials,
        runId: run?.runId ?? globalThis.crypto.randomUUID(),
      },
      45000,
    );
    return response ?? { success: false, error: '자동 로그인 응답이 없습니다.' };
  } catch (error) {
    return {
      success: false,
      pendingLogin: true,
      error: error instanceof Error ? error.message : '자동 로그인 실패',
    };
  }
}

type SellpiaSendResultMetadata = {
  shop?: string;
  fileName?: string;
  url?: string;
};

export type SellpiaSendResult =
  | (SellpiaSendResultMetadata & {
    success: true;
    outcome: 'submitted';
  })
  | (SellpiaSendResultMetadata & {
    success: false;
    outcome: 'not_submitted' | 'unknown';
    error: string;
  });

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
    return {
      success: false,
      outcome: 'not_submitted',
      error:
        '주문수집 확장프로그램이 필요합니다. extensions/order-collector를 Chrome에서 로드한 뒤 다시 시도해주세요.',
    };
  }

  let fileBase64: string;
  try {
    fileBase64 = await blobToBase64(params.blob);
  } catch (error) {
    return {
      success: false,
      outcome: 'not_submitted',
      error: error instanceof Error ? error.message : '파일 인코딩에 실패했습니다.',
    };
  }
  try {
    const response = await sendToExtension<Partial<SellpiaSendResult>>(
      extensionId,
      {
        action: 'sendOrderFileToSellpia',
        shopName: params.shopName,
        fileName: params.fileName,
        fileBase64,
      },
      60000,
    );
    if (response?.outcome === 'submitted' && response.success === true) {
      return { ...response, success: true, outcome: 'submitted' };
    }
    if (response?.outcome === 'not_submitted' || response?.outcome === 'unknown') {
      return {
        ...response,
        success: false,
        outcome: response.outcome,
        error: response.error ?? '셀피아 전송에 실패했습니다.',
      };
    }
    return {
      success: false,
      outcome: 'unknown',
      error: '확장프로그램이 명시적인 셀피아 전송 결과를 반환하지 않았습니다.',
    };
  } catch (error) {
    return {
      success: false,
      outcome: 'unknown',
      error: error instanceof Error ? error.message : '셀피아 전송 응답을 확인하지 못했습니다.',
    };
  }
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
