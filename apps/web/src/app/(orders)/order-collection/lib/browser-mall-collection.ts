import { toast } from 'sonner';
import {
  blockMallAutoLogin,
  isCredentialFailureReason,
  mallAutoLoginRetryAt,
  mallRejectedCredentials,
  markMallAutoLoginAttempt,
  clearMallAutoLoginBlock,
  mallAutoLoginBlock,
} from '@/lib/mall-login-block';
import { formatNumber } from '@/lib/utils';
import { EXTENSION_TIMEOUT_MESSAGE, sendToExtension } from '@/lib/extension-bridge';
import {
  collectIcecreamMallRowsFromExtension,
  createOrderCollectionExtensionError,
  detectOrderCollectionSessionExtension,
  ensureMallLoggedInViaExtension,
  orderCollectionExtensionRunFields,
  type OrderCollectionExtensionRun,
} from './order-collection-extension';
import {
  orderMallAccountApi,
  type OrderCollectionMallAccount,
} from '@/lib/order-mall-account-api';
import {
  ICECREAM_MALL_KEY,
  isBrowserCollectableMall,
  isNoNewOrdersMessage,
  todayYmd,
  type ConversionHistoryItem,
} from './order-collection-page-model';
import {
  readOrderCollectionContinuation,
  regenerateOrderCollectionSource,
} from './order-collection-api';
import { saveIcecreamDeliveryIndex } from './icecream-delivery-index';
import { addSeenOrderKeys, distinctOrderNumbers, rowKeysOf } from './order-detect';

/**
 * 수집할 신규 주문이 없을 때의 안내.
 *
 * 몰마다 문구도 심각도도 제각각이었다(키즈노트만 빨간 error, 어떤 몰은 날짜를 붙이고
 * 어떤 몰은 "신규"를 붙였다). 주문이 없는 건 실패가 아니므로 항상 중립 토스트 하나로
 * 통일한다. 몰별로 덧붙일 안내가 있으면 `hint` 로만 보탠다.
 */
export function toastNoNewOrders(mallLabel: string, hint?: string): void {
  toast(`${mallLabel} 신규 주문이 없습니다.`, hint ? { description: hint } : undefined);
}

export interface BrowserMallCollectionResult {
  rowCount: number;
  masked: boolean;
  date: string | null;
}

type ServerOwnedConversionReceipt = {
  success?: boolean;
  sourceRows?: number | null;
  productRows?: number | null;
  outputRows?: number | null;
  skippedRows?: number | null;
  fileName?: string | null;
  artifactId?: string | null;
};

type ServerOwnedCollectionResponse = {
  success?: boolean;
  attemptId?: string;
  terminalState?: string;
  continuationRequired?: boolean;
  pendingLogin?: boolean;
  pendingAuth?: boolean;
  errorCode?: string;
  error?: string;
  ownerReconciliation?: string;
  sourcePayload?: unknown;
  conversion?: ServerOwnedConversionReceipt;
  /** Internal-only transient output recovered after a lost extension ACK. */
  recoveredResult?: Awaited<ReturnType<typeof regenerateOrderCollectionSource>>;
};

interface BrowserMallCollectorOptions {
  mallAccounts: OrderCollectionMallAccount[];
  addGeneratedFile: (historyItem: ConversionHistoryItem) => void;
  setPreviewId: (id: string) => void;
}

/**
 * 몰에 들어가기 전에 저장된 아이디·비밀번호로 로그인해 둔다. 수집기 안에서도, 쿠팡직배송
 * 달력처럼 수집기 밖에서 몰 화면에 들어가는 길에서도 같은 규칙을 쓴다 — 차단·재시도 간격·
 * 몰이 남긴 답 처리까지 한 곳에 있다.
 */
export async function ensureMallLoginForRun(
  account: Readonly<{
    key: string;
    name?: string;
    loginId?: string | null;
    supplierLoginId?: string | null;
    hasPassword?: boolean;
    siteUrl?: string | null;
  }>,
  run: OrderCollectionExtensionRun,
): Promise<void> {
  const mallKey = account.key;
  const mallName = account.name ?? account.key;
  // 한 번 실패한 몰은 **다시 로그인하러 들어가지 않는다**(또 두드리면 계정이 잠긴다).
  // 다만 수집까지 막지는 않는다 — 브라우저에 세션이 살아 있으면 로그인 없이도 수집된다.
  // 세션까지 죽었으면 수집기가 "로그인 필요"로 정확히 알려 준다.
  if (mallAutoLoginBlock(mallKey)) {
    toast.warning(`${mallName} 자동 로그인은 멈춰 있습니다`, {
      description: '한 번 실패해 다시 시도하지 않습니다. 로그인이 풀렸다면 몰에 직접 로그인해 주세요.',
    });
    return;
  }
  // 스스로 도는 수집(자동 운전 · 자동감지)만 간격을 지킨다. 로그인 뒤 화면은 몰마다 달라
  // '됐다/안 됐다'를 화면만으로 단정할 수 없어서, 판정 대신 횟수로 계정 잠금을 막는다.
  // 사람이 누른 수집은 언제나 로그인부터 확인한다 — 사람이 보고 있고, 지금 되기를 바라고 눌렀다.
  const automatic = run.selectionMode === 'automatic';
  const retryAt = automatic ? mallAutoLoginRetryAt(mallKey) : null;
  if (retryAt) {
    toast.info(`${mallName} 자동 로그인은 조금 전에 시도했습니다`, {
      description: '한 시간에 한 번만 넣습니다. 지금 로그인이 필요하면 몰에 직접 로그인해 주세요.',
    });
    return;
  }
  const credentials = await loadMallCredentialsForLogin(account);
  if (!credentials) return;
  if (automatic) markMallAutoLoginAttempt(mallKey);
  const result = await ensureMallLoggedInViaExtension(mallKey, credentials, run);
  if (result.success) {
    // 확장이 로그인 화면이 사라진 것까지 봤을 때만 '됐다'로 친다. 확인하지 못했으면 차단을
    // 풀지 않고 그대로 둔다 — 다음 시도는 위 간격이 막는다.
    if (result.submitted && result.verified === false) {
      // 몰이 알림 창으로 남긴 답이 있으면 그 말이 먼저다 — 왜 안 됐는지는 몰이 가장 잘 안다.
      // 그 말이 "아이디·비밀번호가 다르다"면 더 두드리지 않는다(계정이 잠긴다).
      if (mallRejectedCredentials(result.mallMessage)) {
        blockMallAutoLogin(mallKey, result.mallMessage ?? '몰이 아이디·비밀번호를 거부했습니다.');
        toast.error(`${mallName} 로그인 실패 — 저장된 아이디·비밀번호를 고쳐 주세요`, {
          description: `${mallName}: ${result.mallMessage}`,
        });
        return;
      }
      toast.warning(`${mallName} 로그인했는지 확인하지 못했습니다`, {
        description: result.mallMessage
          ? `${mallName}: ${result.mallMessage}`
          : '아이디·비밀번호를 넣고 눌렀지만 로그인 화면이 남아 있습니다. 열린 탭을 확인해 주세요.',
      });
      return;
    }
    clearMallAutoLoginBlock(mallKey);
    return;
  }
  // 사람이 몰 화면에서 인증(본인확인 · OTP · 캡차)만 하면 되는 상태는 자격증명 문제가
  // 아니므로 막지 않는다. 그 밖의 실패(비밀번호 거부 · 폼 제출 실패)만 다음부터 건너뛴다.
  //
  // 우리 쪽이 답하지 못한 것(확장 시간 초과 · 서버 요청 한도 초과 · 확장 없음 · 로그인 화면에
  // 접근하지 못함)도 막지 않는다 — 비밀번호가 틀린 게 아니라 우리가 못 들은 것이다. 이걸로
  // 막으면 멀쩡히 로그인된 몰이 '직접 로그인 필요'로 굳어, 사장님은 로그인돼 있는데 로그인하라는
  // 화면을 보게 된다.
  const reason = result.error ?? '자동 로그인을 완료하지 못했습니다.';
  const timedOut = reason === EXTENSION_TIMEOUT_MESSAGE;
  const unreachable = result.loginPageUnreachable === true;
  // 확장이 답을 못 한 것(시간 초과)은 로그인 실패가 아니다. 위의 차단 규칙과 같다 — 세션이
  // 살아 있으면 로그인 없이도 수집되고, 세션이 죽었으면 수집기가 '로그인 필요'로 정확히
  // 알린다. 여기서 던지면 로그인된 몰이 '파일 생성 실패'로 끝났다(2026-09-18 도매꾹 · GS샵).
  // 로그인 화면에 닿지 못한 것은 다르다 — 사람이 로그인해야 하는 화면이라 멈춘다(차단은 안 한다).
  if (timedOut) return;
  if (!result.pendingLogin && !unreachable && isCredentialFailureReason(reason)) {
    blockMallAutoLogin(mallKey, reason);
    toast.error(`${mallName} 자동 로그인 실패 — 직접 로그인해 주세요`, {
      description: '다음부터는 자동 로그인을 시도하지 않습니다. 몰에 직접 로그인한 뒤 수집해 주세요.',
    });
  }
  throw createOrderCollectionExtensionError(
    result,
    `${mallName} 로그인을 완료하지 못했습니다. 직접 로그인해 주세요.`,
  );
}

/** 그 몰 하나의 자격증명만 그때 불러온다. 표를 열었다고 미리 받아두지 않는다. */
async function loadMallCredentialsForLogin(
  account: Readonly<{
    key: string;
    loginId?: string | null;
    supplierLoginId?: string | null;
    hasPassword?: boolean;
    siteUrl?: string | null;
  }>,
): Promise<{ loginId: string; supplierLoginId?: string; password: string; siteUrl?: string } | null> {
  try {
    if (!account.loginId || !account.hasPassword) return null;
    const { password } = await orderMallAccountApi.password(account.key);
    return password
      ? {
          loginId: account.loginId,
          ...(account.supplierLoginId ? { supplierLoginId: account.supplierLoginId } : {}),
          password,
          // 확장에 고정 로그인 주소가 없는 몰은 이 주소로 들어가 로그인한다.
          ...(account.siteUrl ? { siteUrl: account.siteUrl } : {}),
        }
      : null;
  } catch {
    return null;
  }
}

export function createBrowserMallCollector({
  mallAccounts,
  addGeneratedFile,
  setPreviewId,
}: BrowserMallCollectorOptions) {
  const currentMallAccountByKey = new Map(
    mallAccounts.map((account) => [account.key, account]),
  );
  const addBrowserGeneratedFile = (historyItem: ConversionHistoryItem) => {
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
  };

  const ensureMallLogin = async (
    mallKey: string,
    run: OrderCollectionExtensionRun,
  ): Promise<void> => ensureMallLoginForRun(
    currentMallAccountByKey.get(mallKey) ?? { key: mallKey },
    run,
  );

  /**
   * Dispatches a named native collector in server-owned mode. The extension
   * response is intentionally a scalar conversion receipt; provider rows,
   * HTML, CSV and workbooks never cross this response boundary.
   */
  const collectServerOwnedMall = async (
    account: OrderCollectionMallAccount,
    run: OrderCollectionExtensionRun,
  ): Promise<ServerOwnedCollectionResponse> => {
    const extensionId = run.extensionId ?? await detectOrderCollectionSessionExtension();
    if (!extensionId) throw new Error('주문수집 확장프로그램을 찾을 수 없습니다.');

    // Browser attempts carry the date admitted by the owner. A nullable
    // legacy browser run is rejected before any extension message is sent;
    // there is no page-date substitution for a server-owned attempt.
    if (run.serverOwned && !run.date) {
      throw new Error('ORDER_COLLECTION_DATE_NOT_ADMITTED');
    }
    const date = run.date ?? todayYmd();
    const credentials = account.key === ICECREAM_MALL_KEY
      ? await loadMallLoginCredentials(account)
      : await loadMallCredentialsForLogin(account);
    if (credentials) await ensureMallLogin(account.key, run);

    const actionByMall: Record<string, string> = {
      'icecream-mall': 'collectIcecreamMallOrders',
      kidsnote: 'collectKidsnoteOrders',
      kkomangse: 'collectKkomangseOrders',
      onch: 'collectOnchannelOrders',
      domeggook: 'collectDomeggookOrders',
      kidkids: 'collectKidkidsOrders',
      'haebub-mall': 'collectHaebeopOrders',
      'lotte-on': 'collectLotteonOrders',
      'gs-shop': 'collectGsshopOrders',
      always: 'collectAlwayzOrders',
      kakao: 'collectKakaoOrders',
      boribori: 'collectBoriboriOrders',
      'teacher-mall': 'collectTeachervilleOrders',
      art09: 'collectArt09Orders',
    };
    const action = actionByMall[account.key];
    if (!action) throw new Error(`${account.name} 자동 수집은 준비 중입니다.`);

    const message: Record<string, unknown> = {
      action,
      date,
      ...orderCollectionExtensionRunFields(run),
    };
    if (account.key === ICECREAM_MALL_KEY) {
      Object.assign(message, { credentials });
    }
    if (account.key === 'kidsnote') {
      Object.assign(message, { from: date, to: date, status: '', withDetail: true });
    }
    if (account.key === 'boribori') {
      Object.assign(message, { password: credentials?.password ?? '' });
    }
    let response: ServerOwnedCollectionResponse | undefined;
    try {
      response = await sendToExtension<ServerOwnedCollectionResponse>(
        extensionId,
        message,
        account.key === 'domeggook' ? 260000 : 200000,
      );
    } catch (error) {
      // The extension may have committed COMPLETE immediately before its
      // response channel disappeared. Probe the same attempt's retained
      // source and regenerate the transient output; never recollect or
      // convert a new owner input. If the probe is not COMPLETE yet, leave
      // the attempt running so the caller can reconcile/resume it instead of
      // sending a contradictory failure request.
      try {
        const recoveredResult = await regenerateOrderCollectionSource(run, { download: false });
        return {
          success: true,
          attemptId: run.attemptId,
          terminalState: 'COMPLETE',
          recoveredResult,
        };
      } catch {
        const uncertain = error instanceof Error
          ? error
          : new Error(`${account.name} 주문 수집 응답을 확인하지 못했습니다.`);
        Object.assign(uncertain, { ownerReconciliationRequired: true });
        throw uncertain;
      }
    }

    // A converter response can be lost after the server has already committed
    // the source artifact. COMPLETE is authoritative in that case; the
    // explicit regeneration below recreates the transient workbook from the
    // retained source instead of reporting a false failure or recollecting.
    if (!response?.success || (
      response.terminalState !== 'COMPLETE' && !response.conversion
    )) {
      const error = new Error(response?.error ?? `${account.name} 주문 수집 실패`);
      Object.assign(error, {
        code: response?.errorCode,
        pendingLogin: response?.pendingLogin,
        pendingAuth: response?.pendingAuth,
        ownerReconciliationRequired: response?.ownerReconciliation === 'required',
        sourcePayload: response?.sourcePayload,
      });
      throw error;
    }
    return response;
  };

  const generateServerOwnedSellpia = async (
    account: OrderCollectionMallAccount,
    run: OrderCollectionExtensionRun,
  ): Promise<BrowserMallCollectionResult> => {
    const receipt = await collectServerOwnedMall(account, run);
    const result = receipt.recoveredResult
      ?? await regenerateOrderCollectionSource(run, { download: false });
    const continuation = account.key === ICECREAM_MALL_KEY
      ? await readOrderCollectionContinuation(run)
      : null;
    const conversion = receipt.conversion ?? {};
    const collectedRows = conversion.sourceRows ?? result.sourceRows ?? continuation?.sourceRows;
    if (collectedRows === null || collectedRows === undefined) {
      throw new Error('ORDER_COLLECTION_SOURCE_ROWS_UNAVAILABLE');
    }
    if (collectedRows === 0 && result.outputRows === 0) {
      toastNoNewOrders(account.name);
      return { rowCount: 0, masked: false, date: collectionDateOf(run) };
    }
    if (continuation) {
      saveIcecreamDeliveryIndex(continuation.headers, continuation.originalRows);
    }
    const convertedAt = Date.now();
    const historyItem = {
      ...result,
      id: `${convertedAt}-${account.key}-browser`,
      sourceName: `${account.name} 브라우저 수집 (${formatNumber(collectedRows)}행)`,
      convertedAt,
      collectionDate: collectionDateOf(run),
      collectionMode: 'browser' as const,
      collectedRows,
      mallKey: account.key,
      mallName: account.name,
    };
    addBrowserGeneratedFile(historyItem);
    if (continuation) {
      addSeenOrderKeys(account.key, continuation.selectedRowKeys);
    }
    return {
      rowCount: collectedRows,
      masked: false,
      date: collectionDateOf(run),
    };
  };

  const generateKidsnoteSellpia = async (
    run: OrderCollectionExtensionRun,
    collectionDate: string,
  ): Promise<number> => {
    const { collectKidsnoteOrdersFromExtension, convertKidsnoteToSellpiaFile } = await import(
      './kidsnote-orders-api'
    );
    await ensureMallLogin('kidsnote', run);
    const { orders } = await collectKidsnoteOrdersFromExtension(
      collectionDate,
      collectionDate,
      '',
      true,
      run,
    );
    if (!orders.length) {
      toastNoNewOrders('키즈노트');
      return 0;
    }
    const result = await convertKidsnoteToSellpiaFile(orders, { run });
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-kidsnote-browser`,
      sourceName: `키즈노트 주문 (${formatNumber(orders.length)}건)`,
      convertedAt,
      collectionDate,
      collectionMode: 'browser',
      collectedRows: orders.length,
      mallKey: 'kidsnote',
      mallName: '키즈노트',
    });
    return orders.length;
  };

  const generateKkomangseSellpia = async (run: OrderCollectionExtensionRun): Promise<number> => {
    const { collectKkomangseXlsxFromExtension, convertKkomangseToSellpiaFile } = await import(
      './kkomangse-orders-api'
    );
    await ensureMallLogin('kkomangse', run);
    const xlsxBase64 = await collectKkomangseXlsxFromExtension(run);
    let result: Awaited<ReturnType<typeof convertKkomangseToSellpiaFile>>;
    try {
      result = await convertKkomangseToSellpiaFile(xlsxBase64, {
        date: collectionDateOf(run),
        run,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isNoNewOrdersMessage(msg)) {
        toastNoNewOrders('꼬망세');
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-kkomangse-browser`,
      sourceName: `꼬망세 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: collectionDateOf(run),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'kkomangse',
      mallName: '꼬망세',
    });
    return rows;
  };

  const generateDomeggookSellpia = async (
    run: OrderCollectionExtensionRun,
    collectionDate: string,
  ): Promise<number> => {
    const { collectDomeggookCsvFromExtension, convertDomeggookCsvBase64 } = await import(
      './domeggook-orders-api'
    );
    await ensureMallLogin('domeggook', run);
    const collected = await collectDomeggookCsvFromExtension(collectionDate, run);
    if ('empty' in collected) {
      toastNoNewOrders('도매꾹', `조회일 ${collectionDate}`);
      return 0;
    }
    const { csvBase64, fileName } = collected;
    let result: Awaited<ReturnType<typeof convertDomeggookCsvBase64>>;
    try {
      result = await convertDomeggookCsvBase64(csvBase64, fileName, {
        date: collectionDate,
        download: false,
        run,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isNoNewOrdersMessage(msg)) {
        toastNoNewOrders('도매꾹', `조회일 ${collectionDate}`);
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-domeggook-browser`,
      sourceName: `도매꾹 주문 ${collectionDate} (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate,
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'domeggook',
      mallName: '도매꾹',
    });
    return rows;
  };

  const generateKidkidsSellpia = async (run: OrderCollectionExtensionRun): Promise<number> => {
    const { collectKidkidsOrdersFromExtension, convertKidkidsToSellpiaFile } = await import(
      './kidkids-orders-api'
    );
    await ensureMallLogin('kidkids', run);
    // 발주서02는 출고예정등록 없이도 전체 데이터를 반환하므로 수집은 읽기 전용으로 둔다(planDate 미전달).
    // 출고예정일 지정은 조작자가 출고관리 화면에서 직접 한다(그쪽이 몰이 제안한 출고일로 등록). 확장은
    // planDate 를 받으면 미지정 주문에 한해 출고예정등록도 할 수 있으나, 실주문 상태변경이라 기본은 끈다.
    const orders = await collectKidkidsOrdersFromExtension(undefined, run);
    if (orders.length === 0) {
      toastNoNewOrders(
        '키드키즈',
        '이미 출고처리한 주문은 출고관리 목록에서 빠집니다.',
      );
      return 0;
    }
    const result = await convertKidkidsToSellpiaFile(orders, { download: false, run });
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-kidkids-browser`,
      sourceName: `키드키즈 주문 (${formatNumber(orders.length)}건)`,
      convertedAt,
      collectionDate: collectionDateOf(run),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'kidkids',
      mallName: '키드키즈',
    });
    return rows;
  };

  const generateHaebeopSellpia = async (run: OrderCollectionExtensionRun): Promise<number> => {
    const { collectHaebeopOrdersFromExtension, convertHaebeopToSellpiaFile } = await import(
      './haebeop-orders-api'
    );
    await ensureMallLogin('haebub-mall', run);
    // 해법몰은 엑셀 다운로드가 암호 ZIP 이라, 주문 상세 팝업을 읽어 다운로드 없이 수집한다.
    const orders = await collectHaebeopOrdersFromExtension({ date: collectionDateOf(run) }, run);
    if (orders.length === 0) {
      toastNoNewOrders('해법몰', `발주일 ${collectionDateOf(run)} · 결제완료 기준`);
      return 0;
    }
    const result = await convertHaebeopToSellpiaFile(orders, { download: false, run });
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      // 해법몰은 택배비가 별도 행이 아니라 같은 행의 컬럼이라 "출력행 - 상품행" 주문수 추정이
      // 0 이 된다. 주문번호를 직접 넘겨 몰 카드 집계와 셀피아 대조가 실주문 기준으로 돌게 한다.
      orderNumbers: [...new Set(
        orders.map((order) => String(order.orderNo ?? '').trim()).filter(Boolean),
      )],
      id: `${convertedAt}-haebub-mall-browser`,
      sourceName: `해법몰 주문 (${formatNumber(orders.length)}건)`,
      convertedAt,
      collectionDate: collectionDateOf(run),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'haebub-mall',
      mallName: '해법몰',
    });
    return rows;
  };

  const generateLotteonSellpia = async (run: OrderCollectionExtensionRun): Promise<number> => {
    const { collectLotteonXlsxFromExtension, convertLotteonToSellpiaFile } = await import(
      './lotteon-orders-api'
    );
    // 로그인 화면(login_SO.wsp)은 <form> 없는 WebSquare 지만 사용자ID/비밀번호 input 과
    // <a id="mf_btn_login">로그인</a> 이 실재해 form-fill 이 된다(2026-09-01 DOM 확인).
    // 자동 로그인이 실패하면 collectLotteon 이 로그인 탭을 띄우고 "로그인 필요"로 안내한다.
    await ensureMallLogin('lotte-on', run);
    const { xlsxBase64, fileName } = await collectLotteonXlsxFromExtension(run);
    let result: Awaited<ReturnType<typeof convertLotteonToSellpiaFile>>;
    try {
      result = await convertLotteonToSellpiaFile(xlsxBase64, fileName, { download: false, run });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isNoNewOrdersMessage(msg)) {
        toastNoNewOrders('롯데ON');
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-lotte-on-browser`,
      sourceName: `롯데ON 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: collectionDateOf(run),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'lotte-on',
      mallName: '롯데ON',
    });
    return rows;
  };

  const generateGsshopSellpia = async (run: OrderCollectionExtensionRun): Promise<number> => {
    const { collectGsshopXlsxFromExtension, convertGsshopToSellpiaFile } = await import(
      './gsshop-orders-api'
    );
    await ensureMallLogin('gs-shop', run);
    const collected = await collectGsshopXlsxFromExtension(run);
    if ('empty' in collected) {
      toastNoNewOrders('GS샵');
      return 0;
    }
    let result: Awaited<ReturnType<typeof convertGsshopToSellpiaFile>>;
    try {
      result = await convertGsshopToSellpiaFile(collected.xlsxBase64, collected.fileName, {
        download: false,
        run,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isNoNewOrdersMessage(msg)) {
        toastNoNewOrders('GS샵');
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-gs-shop-browser`,
      sourceName: `GS샵 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: collectionDateOf(run),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'gs-shop',
      mallName: 'GS샵',
    });
    return rows;
  };

  const generateAlwayzSellpia = async (run: OrderCollectionExtensionRun): Promise<number> => {
    const { collectAlwayzXlsxFromExtension, convertAlwayzToSellpiaFile } = await import(
      './alwayz-orders-api'
    );
    await ensureMallLogin('always', run);
    const collected = await collectAlwayzXlsxFromExtension(run);
    if ('empty' in collected) {
      toastNoNewOrders('올웨이즈');
      return 0;
    }
    let result: Awaited<ReturnType<typeof convertAlwayzToSellpiaFile>>;
    try {
      result = await convertAlwayzToSellpiaFile(collected.xlsxBase64, collected.fileName, {
        download: false,
        run,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isNoNewOrdersMessage(msg)) {
        toastNoNewOrders('올웨이즈');
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-always-browser`,
      sourceName: `올웨이즈 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: collectionDateOf(run),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'always',
      mallName: '올웨이즈',
    });
    return rows;
  };

  const generateBoriboriSellpia = async (run: OrderCollectionExtensionRun): Promise<number> => {
    const { collectBoriboriXlsxFromExtension, convertBoriboriToSellpiaFile } = await import(
      './boribori-orders-api'
    );
    await ensureMallLogin('boribori', run);
    const collected = await collectBoriboriXlsxFromExtension({ run });
    if ('empty' in collected) {
      toastNoNewOrders('보리보리', '결제완료 상태 기준');
      return 0;
    }
    const { xlsxBase64, fileName } = collected;
    let result: Awaited<ReturnType<typeof convertBoriboriToSellpiaFile>>;
    try {
      result = await convertBoriboriToSellpiaFile(xlsxBase64, fileName, { download: false, run });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isNoNewOrdersMessage(msg)) {
        toastNoNewOrders('보리보리', '결제완료 상태 기준');
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-boribori-browser`,
      sourceName: `보리보리 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: collectionDateOf(run),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'boribori',
      mallName: '보리보리',
    });
    return rows;
  };

  const generateTeachervilleSellpia = async (run: OrderCollectionExtensionRun): Promise<number> => {
    const { collectTeachervilleXlsxFromExtension, convertTeachervilleToSellpiaFile } = await import(
      './teacherville-orders-api'
    );
    await ensureMallLogin('teacher-mall', run);
    const collected = await collectTeachervilleXlsxFromExtension(run);
    if ('empty' in collected) {
      toastNoNewOrders('티쳐몰', '출고 전 상태 기준');
      return 0;
    }
    const { xlsxBase64, fileName } = collected;
    let result: Awaited<ReturnType<typeof convertTeachervilleToSellpiaFile>>;
    try {
      result = await convertTeachervilleToSellpiaFile(xlsxBase64, fileName, { download: false, run });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isNoNewOrdersMessage(msg)) {
        toastNoNewOrders('티쳐몰', '출고 전 상태 기준');
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-teacher-mall-browser`,
      sourceName: `티쳐몰 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: collectionDateOf(run),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'teacher-mall',
      mallName: '티쳐몰',
    });
    return rows;
  };

  const generateArt09Csv = async (run: OrderCollectionExtensionRun): Promise<number> => {
    const { collectArt09OrdersFromExtension, convertArt09ToSellpiaFile } = await import(
      './art09-orders-api'
    );
    await ensureMallLogin('art09', run);
    const collectedRows = await collectArt09OrdersFromExtension(run);
    if (collectedRows.length === 0) {
      toastNoNewOrders('아트공구');
      return 0;
    }
    const result = await convertArt09ToSellpiaFile(collectedRows, { download: false, run });
    const outputRows = result.outputRows ?? 0;
    if (outputRows === 0) {
      toastNoNewOrders('아트공구');
      return 0;
    }

    const orderCount = result.sourceRows || collectedRows.length || outputRows;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-art09-browser`,
      sourceName: `아트공구 주문 (${formatNumber(orderCount)}건 · ${formatNumber(outputRows)}품목)`,
      convertedAt,
      collectionDate: collectionDateOf(run),
      collectionMode: 'browser',
      collectedRows: orderCount,
      mallKey: 'art09',
      mallName: '아트공구',
      orderNumbers: distinctOrderNumbersFromArt09(collectedRows),
    });
    return orderCount;
  };

  const generateOnchannelSellpia = async (
    run: OrderCollectionExtensionRun,
    collectionDate: string,
  ): Promise<number> => {
    const { collectOnchannelOrdersFromExtension, convertOnchannelToSellpiaFile } = await import(
      './onchannel-orders-api'
    );
    await ensureMallLogin('onch', run);
    const orders = await collectOnchannelOrdersFromExtension(collectionDate, run);
    if (orders.length === 0) {
      toastNoNewOrders('온채널');
      return 0;
    }
    const result = await convertOnchannelToSellpiaFile(orders, { run });
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-onch-browser`,
      sourceName: `온채널 주문 (${formatNumber(orders.length)}건)`,
      convertedAt,
      collectionDate,
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'onch',
      mallName: '온채널',
    });
    return rows;
  };

  const generateKakaoSellpia = async (run: OrderCollectionExtensionRun): Promise<number> => {
    const { collectKakaoOrdersFromExtension, throwKakaoConversionUnsupported } = await import(
      './kakao-orders-api'
    );
    // 카카오는 토큰/SSO 로그인이라 form-fill 자동로그인 불가 — collectKakao 가 미로그인을 감지해
    // pendingLogin 으로 "로그인 필요"를 안내한다.
    const orders = await collectKakaoOrdersFromExtension(undefined, run);
    if (orders.length === 0) {
      toastNoNewOrders('카카오', '배송준비중 상태 기준');
      return 0;
    }
    return throwKakaoConversionUnsupported(orders);
  };

  return async function collectBrowserMall(
    account: OrderCollectionMallAccount,
    run?: OrderCollectionExtensionRun,
  ): Promise<BrowserMallCollectionResult> {
    // Dashboard execution refreshes the account list immediately before a
    // batch. Keep login preflight on that same fresh account snapshot instead
    // of the list captured when this collector was first rendered.
    currentMallAccountByKey.set(account.key, account);
    const extensionId = run?.extensionId ?? await detectOrderCollectionSessionExtension();
    if (!extensionId) {
      throw new Error('주문수집 확장프로그램을 찾을 수 없습니다.');
    }
    const resolvedRun: OrderCollectionExtensionRun = {
      attemptId: run!.attemptId,
      attemptToken: run!.attemptToken,
      extensionId,
      date: run?.date ?? (run?.serverOwned ? null : todayYmd()),
      signal: run?.signal,
      ...(run?.serverOwned ? { serverOwned: true } : {}),
      ...(run?.selectionMode ? { selectionMode: run.selectionMode } : {}),
      ...(run?.seenRowKeys ? { seenRowKeys: [...run.seenRowKeys] } : {}),
      // 어느 소유자의 시도인지 같이 들고 가야 한다. 빠뜨리면 쿠팡직배송 시도를 몰 소유자에게
      // 보내게 되고, 몰 쪽에는 그 시도가 없으므로 `ORDER_COLLECTION_ATTEMPT_NOT_FOUND` 로
      // 끝난다 — 진짜 원인은 가려진 채 그 문구만 뜬다(사장님 2026-09-21).
      ...(run?.sourceOwner ? { sourceOwner: run.sourceOwner } : {}),
    };
    if (resolvedRun.serverOwned) {
      return generateServerOwnedSellpia(account, resolvedRun);
    }
    const today = collectionDateOf(resolvedRun);
    if (account.key === 'kidsnote') return resultFor(await generateKidsnoteSellpia(resolvedRun, today), today);
    if (account.key === 'kkomangse') return resultFor(await generateKkomangseSellpia(resolvedRun), today);
    if (account.key === 'onch') return resultFor(await generateOnchannelSellpia(resolvedRun, today), today);
    if (account.key === 'kakao') return resultFor(await generateKakaoSellpia(resolvedRun), today);
    if (account.key === 'domeggook') return resultFor(await generateDomeggookSellpia(resolvedRun, today), today);
    if (account.key === 'kidkids') return resultFor(await generateKidkidsSellpia(resolvedRun), today);
    if (account.key === 'lotte-on') return resultFor(await generateLotteonSellpia(resolvedRun), today);
    if (account.key === 'gs-shop') return resultFor(await generateGsshopSellpia(resolvedRun), today);
    if (account.key === 'always') return resultFor(await generateAlwayzSellpia(resolvedRun), today);
    if (account.key === 'boribori') return resultFor(await generateBoriboriSellpia(resolvedRun), today);
    if (account.key === 'teacher-mall') return resultFor(await generateTeachervilleSellpia(resolvedRun), today);
    if (account.key === 'art09') return resultFor(await generateArt09Csv(resolvedRun), today);
    if (account.key === 'haebub-mall') return resultFor(await generateHaebeopSellpia(resolvedRun), today);
    if (!isBrowserCollectableMall(account)) {
      throw new Error(`${account.name} 자동 수집은 준비 중입니다.`);
    }

    const credentials = await loadMallLoginCredentials(account);
    const collected = await collectIcecreamMallRowsFromExtension(today, credentials, resolvedRun);
    saveIcecreamDeliveryIndex(collected.headers, collected.rows);
    const { convertIcecreamMallOrderRows } = await import('./order-collection-api');
    const result = await convertIcecreamMallOrderRows({
      headers: collected.headers,
      rows: collected.rows,
      fileName: `아이스크림몰_${collected.date ?? today}_브라우저수집`,
    }, { run });
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-${account.key}-browser`,
      sourceName: `${account.name} 브라우저 수집 (${formatNumber(collected.rowCount)}행)`,
      convertedAt,
      collectionDate: collected.date ?? today,
      collectionMode: 'browser',
      collectedRows: collected.rowCount,
      mallKey: account.key,
      mallName: account.name,
      orderNumbers: distinctOrderNumbers(collected.headers, collected.rows),
    });
    addSeenOrderKeys(account.key, rowKeysOf(collected.rows));

    return {
      rowCount: collected.rowCount,
      masked: collected.masked,
      date: collected.date,
    };
  };
}

function resultFor(rowCount: number, date: string): BrowserMallCollectionResult {
  return {
    rowCount,
    masked: false,
    date,
  };
}

function collectionDateOf(run: OrderCollectionExtensionRun): string {
  if (!run.date) throw new Error('Order collection date is required');
  return run.date;
}

function distinctOrderNumbersFromArt09(rows: Array<{ orderId?: string }>): string[] {
  return [...new Set(
    rows.map((row) => String(row.orderId ?? '').trim()).filter(Boolean),
  )];
}

async function loadMallLoginCredentials(account: OrderCollectionMallAccount) {
  if (!account.loginId || !account.hasPassword) {
    throw new Error(`${account.name} 계정 ID와 비밀번호를 먼저 저장해주세요.`);
  }

  const result = await orderMallAccountApi.password(account.key);
  if (!result.password) {
    throw new Error(`${account.name} 저장된 비밀번호를 불러오지 못했습니다.`);
  }

  return {
    loginId: account.loginId,
    password: result.password,
  };
}
