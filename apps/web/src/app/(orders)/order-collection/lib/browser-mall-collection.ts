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
import { EXTENSION_TIMEOUT_MESSAGE, sendToExtension } from '@/lib/extension-bridge';
import {
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
import { todayYmd } from './order-collection-page-model';

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
};

interface BrowserMallCollectorOptions {
  mallAccounts: OrderCollectionMallAccount[];
}

/**
 * KID-379: 옛 attempt 경로(카카오)의 로그인 준비. 실행 kind 몰은 확장이 실행 안에서 로그인한다(KID-377).
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

/**
 * KID-379: 옛 주문 attempt 경로(카카오)의 브라우저 절차. 카카오는 셀피아 변환 규격이 없어 확장이 그 시도를 늘 원본과 함께
 * 실패(`UNSUPPORTED_CONVERSION`)로 닫는다 — 이 절차가 파일을 만드는 일은 없다. 카카오가 실행 kind로 옮기면 사라진다.
 */
export function createBrowserMallCollector({
  mallAccounts,
}: BrowserMallCollectorOptions) {
  const currentMallAccountByKey = new Map(
    mallAccounts.map((account) => [account.key, account]),
  );

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
    const credentials = await loadMallCredentialsForLogin(account);
    if (credentials) await ensureMallLogin(account.key, run);

    const actionByMall: Record<string, string> = {
      kakao: 'collectKakaoOrders',
    };
    const action = actionByMall[account.key];
    if (!action) throw new Error(`${account.name} 자동 수집은 준비 중입니다.`);

    const message: Record<string, unknown> = {
      action,
      date,
      ...orderCollectionExtensionRunFields(run),
    };
    let response: ServerOwnedCollectionResponse | undefined;
    try {
      response = await sendToExtension<ServerOwnedCollectionResponse>(
        extensionId,
        message,
        200000,
      );
    } catch (error) {
      // 확장이 시도를 끝냈는지 모른다 — 다시 걷지 않고 owner 상태로 맞추도록 남긴다(끝은 owner가 적는다).
      const uncertain = error instanceof Error
        ? error
        : new Error(`${account.name} 주문 수집 응답을 확인하지 못했습니다.`);
      Object.assign(uncertain, { ownerReconciliationRequired: true });
      throw uncertain;
    }

    if (!response?.success || response.terminalState !== 'COMPLETE') {
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
    // 브라우저 시도는 늘 서버 소유 수집이다(옛 페이지 절차는 없다).
    if (!resolvedRun.serverOwned) throw new Error(`${account.name} 자동 수집은 준비 중입니다.`);
    await collectServerOwnedMall(account, resolvedRun);
    // 옛 경로에는 변환이 없다 — 확장이 시도를 완료로 닫는 일은 없어야 한다(카카오는 늘 UNSUPPORTED_CONVERSION).
    throw Object.assign(new Error(`${account.name} 셀피아 변환은 아직 준비 중입니다.`), { code: 'UNSUPPORTED_CONVERSION' });
  };
}
