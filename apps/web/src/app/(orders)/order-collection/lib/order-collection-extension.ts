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

export interface SellpiaUnmatchedRow {
  groupNo: string;
  receiver: string;
  provider: string;
  product: string;
  option: string;
  result: string;
}

export interface SellpiaPostTransferResult {
  success: boolean;
  step?: string;
  listCount?: number;
  productRows?: number;
  matched?: number;
  unmatched?: SellpiaUnmatchedRow[];
  unmatchedCount?: number;
  register?: { registered?: number | null; message?: string };
  message?: string;
  error?: string;
}

/**
 * 셀피아 전송 이후 후처리: 등록 → [재고매칭 화면] 조회 → 자동합포 → 자동재고매칭.
 * 비파괴 단계. 자동재고매칭이 안 된(미매칭/재고부족) 주문 목록을 함께 반환한다.
 */
export async function runSellpiaPostTransferViaExtension(): Promise<SellpiaPostTransferResult> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector를 Chrome에서 로드하고 kiditem.sellpia.com에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const response = await sendToExtension<SellpiaPostTransferResult>(
    extensionId,
    { action: 'sellpiaPostTransfer' },
    240000,
  );
  if (!response) throw new Error('셀피아 후처리 응답이 없습니다.');
  return response;
}

export interface SellpiaInvoiceRow {
  ordNo: string;
  itemNo: string;
  invNo: string;
  courier: string;
  provider: string;
  receiver: string;
  post: string;
  addr: string;
  groupNo?: string;
}

export interface SellpiaAutoInvoiceResult {
  success: boolean;
  invoiced?: number;
  /** 채번 직후 그리드에서 바로 캡처한 발급 송장번호 행들. */
  rows?: SellpiaInvoiceRow[];
  message?: string;
  error?: string;
}

/**
 * ⚠️되돌리기 어려움: 셀피아 송장 자동채번(실제 송장번호 발급). 프론트 확인 이후에만 호출.
 */
export async function runSellpiaAutoInvoiceViaExtension(): Promise<SellpiaAutoInvoiceResult> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. kiditem.sellpia.com에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const response = await sendToExtension<SellpiaAutoInvoiceResult>(
    extensionId,
    { action: 'sellpiaAutoInvoice' },
    180000,
  );
  if (!response) throw new Error('셀피아 송장채번 응답이 없습니다.');
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
