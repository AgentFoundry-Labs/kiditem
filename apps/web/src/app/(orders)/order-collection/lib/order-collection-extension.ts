import {
  detectOrderCollectionExtensionId,
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
  type ExtensionRuntimeStatus,
} from '@/lib/extension-bridge';
import { extractSellpiaOrderNumbers } from './sellpia-order-targets';
import type { OrderCollectionAttemptContext } from './order-collection-source-owner';

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
  supplierLoginId?: string;
  password: string;
}

export type OrderCollectionFailureCode =
  | 'login_required'
  | 'operator_action_required'
  | 'provider_contract_changed'
  | 'network_failed'
  | 'unknown_failure';
type OrderCollectionFailureAction = 'collect_orders';

export interface OrderCollectionFailureEvidence {
  version: 1;
  provider: string;
  action: OrderCollectionFailureAction;
  code: OrderCollectionFailureCode;
  retryable: boolean;
  /** 인증은 몰마다 방식이 달라 GS샵 SMS 외에는 일반 `complete_auth` 로 온다. */
  operatorAction: 'complete_login' | 'complete_sms_auth' | 'complete_auth' | null;
}

export interface OrderCollectionFailureResponse {
  success?: boolean;
  pendingLogin?: boolean;
  errorCode?: OrderCollectionFailureCode;
  failure?: OrderCollectionFailureEvidence;
  error?: string;
}

export class OrderCollectionExtensionError extends Error {
  readonly pendingLogin: boolean;
  readonly errorCode: OrderCollectionFailureCode;
  readonly failure: OrderCollectionFailureEvidence | null;

  constructor(
    message: string,
    options: {
      pendingLogin: boolean;
      errorCode: OrderCollectionFailureCode;
      failure: OrderCollectionFailureEvidence | null;
    },
  ) {
    super(message);
    this.name = 'OrderCollectionExtensionError';
    this.pendingLogin = options.pendingLogin;
    this.errorCode = options.errorCode;
    this.failure = options.failure;
  }
}

export function createOrderCollectionExtensionError(
  response: OrderCollectionFailureResponse | null | undefined,
  fallbackMessage: string,
): OrderCollectionExtensionError {
  const errorCode = response?.failure?.code ?? response?.errorCode ??
    (response?.pendingLogin ? 'login_required' : 'unknown_failure');
  return new OrderCollectionExtensionError(response?.error ?? fallbackMessage, {
    pendingLogin: response?.pendingLogin === true || errorCode === 'login_required',
    errorCode,
    failure: response?.failure ?? null,
  });
}

interface IcecreamMallExtensionResponse
  extends Partial<IcecreamMallExtensionRows>, OrderCollectionFailureResponse {}

export interface OrderCollectionExtensionRun extends OrderCollectionAttemptContext {
  extensionId?: string;
  date?: string | null;
  signal?: AbortSignal;
  /** The extension keeps provider capture + server conversion inside one owner run. */
  serverOwned?: boolean;
  /** Frozen before an automatic attempt starts; never re-read while it runs. */
  selectionMode?: 'manual' | 'automatic';
  seenRowKeys?: string[];
  sourceOwner?: 'order_collection_mall' | 'coupang_directship';
}

/** Fields shared by every named marketplace action sent to the extension. */
export function orderCollectionExtensionRunFields(
  run: OrderCollectionExtensionRun | undefined,
): Record<string, unknown> {
  if (!run) return {};
  return {
    attemptId: run.attemptId,
    deferTerminal: true,
    ...(run.serverOwned ? { serverOwned: true } : {}),
    ...(run.selectionMode ? { selectionMode: run.selectionMode } : {}),
    ...(run.seenRowKeys ? { seenRowKeys: [...run.seenRowKeys] } : {}),
  };
}

export interface MallLoginEnsureResult extends OrderCollectionFailureResponse {
  success: boolean;
  /** 실제로 아이디·비밀번호를 채우고 로그인 버튼까지 눌렀는가. */
  submitted?: boolean;
  /** submitted 가 false 인 이유. 저장된 비밀번호를 검증하지 못한 경우다. */
  reason?: 'unsupported_mall' | 'already_signed_in' | 'no_credentials';
  /** 로그인 버튼을 어떤 방법으로 눌렀는가. 몰별로 어느 경로가 먹는지 진단에 쓴다. */
  method?: string | null;
}

export async function detectOrderCollectionSessionExtension(): Promise<string | null> {
  const status = await detectOrderCollectionSessionExtensionStatus();
  return status.status === 'ready' ? status.extensionId : null;
}

export async function detectOrderCollectionSessionExtensionStatus(): Promise<ExtensionRuntimeStatus> {
  return detectOrderCollectionExtensionRuntime(1200, [
    'browserCollectionSessions',
    'orderCollectionFailureEvidenceV1',
    'orderCollectionConfirmedCoverageV1',
  ]);
}

export function orderCollectionExtensionUnavailableMessage(
  status: Exclude<ExtensionRuntimeStatus, { status: 'ready' }>,
): string {
  if (status.status === 'incompatible') {
    return `주문수집 확장프로그램 ${status.version}이 로드되어 있지만 현재 웹과 호환되지 않습니다. ` +
      `누락 기능: ${status.missingCapabilities.join(', ')}. extensions/kiditem-os를 다시 로드해주세요.`;
  }
  return '주문수집 확장프로그램을 찾지 못했습니다. extensions/kiditem-os를 Chrome에서 로드해주세요.';
}

async function requireOrderCollectionSessionExtension(): Promise<string> {
  const status = await detectOrderCollectionSessionExtensionStatus();
  if (status.status === 'ready') return status.extensionId;
  throw new Error(orderCollectionExtensionUnavailableMessage(status));
}

export async function collectIcecreamMallRowsFromExtension(
  date: string,
  credentials?: IcecreamMallExtensionCredentials,
  run?: OrderCollectionExtensionRun,
): Promise<IcecreamMallExtensionRows> {
  const extensionId = run?.extensionId ?? await requireOrderCollectionSessionExtension();
  const response = await sendToExtension<IcecreamMallExtensionResponse>(extensionId, {
    action: 'collectIcecreamMallOrders',
    date,
    credentials,
    ...orderCollectionExtensionRunFields(run),
  }, 90000);

  if (!response?.success || !response.headers || !response.rows) {
    throw createOrderCollectionExtensionError(
      response,
      response?.pendingLogin
        ? '아이스크림몰 로그인 후 배송 조회 화면을 열어주세요.'
        : '아이스크림몰 주문 수집 실패',
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
  let extensionId = run?.extensionId;
  if (!extensionId) {
    const status = await detectOrderCollectionSessionExtensionStatus();
    if (status.status === 'ready') extensionId = status.extensionId;
    else if (status.status === 'incompatible') {
      return {
        success: false,
        pendingLogin: false,
        errorCode: 'unknown_failure',
        error: orderCollectionExtensionUnavailableMessage(status),
      };
    }
  }
  if (!extensionId) {
    return {
      success: false,
      pendingLogin: false,
      errorCode: 'unknown_failure',
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
        ...(run ? { attemptId: run.attemptId, deferTerminal: true } : {}),
        date: run?.date ?? null,
      },
      45000,
    );
    return response ?? { success: false, error: '자동 로그인 응답이 없습니다.' };
  } catch (error) {
    return {
      success: false,
      pendingLogin: false,
      errorCode: 'unknown_failure',
      error: error instanceof Error ? error.message : '자동 로그인 실패',
    };
  }
}

type SellpiaSendResultMetadata = {
  shop?: string;
  fileName?: string;
  url?: string;
  excelFormat?: string | null;
  acceptedRows?: number;
  pendingRows?: number;
  targetOrderCount?: number;
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
  orderNumbers?: string[];
}): Promise<SellpiaSendResult> {
  const extensionId = await detectOrderCollectionExtensionId(
    1200,
    'sellpiaScopedAutoInvoiceV1',
  );
  if (!extensionId) {
    return {
      success: false,
      outcome: 'not_submitted',
      error:
        '셀피아 접수 확인 기능이 포함된 최신 주문수집 확장프로그램이 필요합니다. 확장프로그램을 다시 로드한 뒤 재시도해주세요.',
    };
  }

  let targetOrderNumbers: string[];
  const suppliedOrderNumbers = [
    ...new Set(params.orderNumbers?.map((value) => String(value).trim()).filter(Boolean) ?? []),
  ];
  try {
    const uploadedWorkbookOrderNumbers = await extractSellpiaOrderNumbers(params.blob);
    targetOrderNumbers = uploadedWorkbookOrderNumbers.length > 0
      ? uploadedWorkbookOrderNumbers
      : suppliedOrderNumbers;
  } catch (error) {
    if (suppliedOrderNumbers.length === 0) {
      return {
        success: false,
        outcome: 'not_submitted',
        error: error instanceof Error ? error.message : '셀피아 주문번호를 읽지 못했습니다.',
      };
    }
    targetOrderNumbers = suppliedOrderNumbers;
  }
  if (targetOrderNumbers.length === 0) {
    return {
      success: false,
      outcome: 'not_submitted',
      error:
        '이번 파일의 주문번호를 식별하지 못해 셀피아 전송을 시작하지 않았습니다. 송장채번 범위를 안전하게 제한할 수 있는 주문번호가 필요합니다.',
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
        targetOrderNumbers,
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
  invoiceTargetCount?: number;
  register?: { registered?: number | null; message?: string };
  message?: string;
  error?: string;
}

/**
 * 셀피아 전송 이후 후처리: 등록 → [재고매칭 화면] 조회 → 자동합포 → 자동재고매칭.
 * 비파괴 단계. 자동재고매칭이 안 된(미매칭/재고부족) 주문 목록을 함께 반환한다.
 */
export async function runSellpiaPostTransferViaExtension(): Promise<SellpiaPostTransferResult> {
  const extensionId = await detectOrderCollectionExtensionId(
    1200,
    'sellpiaScopedAutoInvoiceV1',
  );
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/kiditem-os를 Chrome에서 로드하고 kiditem.sellpia.com에 로그인한 뒤 다시 시도하세요.',
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
  requestedTargetCount?: number;
  selectedTargetCount?: number;
  missingTargetCount?: number;
  /** 채번 직후 그리드에서 바로 캡처한 발급 송장번호 행들. */
  rows?: SellpiaInvoiceRow[];
  message?: string;
  error?: string;
}

/**
 * ⚠️되돌리기 어려움: 셀피아 송장 자동채번(실제 송장번호 발급). 프론트 확인 이후에만 호출.
 */
export async function runSellpiaAutoInvoiceViaExtension(): Promise<SellpiaAutoInvoiceResult> {
  const extensionId = await detectOrderCollectionExtensionId(
    1200,
    'sellpiaScopedAutoInvoiceV1',
  );
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
