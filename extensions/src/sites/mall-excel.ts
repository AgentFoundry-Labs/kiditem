import { RuntimeError } from '../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../core/site-caller';

/**
 * 엑셀·blob을 내려받는 몰(꼬망세·롯데ON·보리보리·티쳐몰·GS샵·올웨이즈, KID-380)의 페이지 호출 답. 처리기 파일
 * (`content/page-call/<mall>-orders.js`)이 옛 worker.js `scrape*Orders`를 그대로 옮겨 옛 답 모양을 그대로 돌려준다.
 */
export interface MallExcelAnswer {
  success?: boolean;
  empty?: boolean;
  xlsxBase64?: string;
  fileName?: string;
  pendingLogin?: boolean;
  pendingAuth?: boolean;
  errorCode?: string;
  error?: string;
}

/** 파일 base64 한 조각의 글자 수 — 청크 1MiB 안에 들게(도매꾹 CSV 조각과 같은 값). */
export const MALL_FILE_PART_CHARS = 700_000;

const MALL_CONTRACT_CHANGED = 'MALL_CONTRACT_CHANGED' as const;
const OPERATOR_ACTION_REQUIRED = 'OPERATOR_ACTION_REQUIRED' as const;

/** 파일 하나를 서버 `order_rows` 원소(`{fileName, part, parts, base64}`)로 나눈다 — 서버 finalize가 이어 붙인다. */
export function filePartRows(fileName: string, base64: string, partChars = MALL_FILE_PART_CHARS): unknown[] {
  const parts = Math.max(1, Math.ceil(base64.length / partChars));
  return Array.from({ length: parts }, (_, part) => ({
    fileName,
    part,
    parts,
    base64: base64.slice(part * partChars, (part + 1) * partChars),
  }));
}

/**
 * 옛 답 → 주문 원소. 성공이면 파일 조각, 인증된 빈 목록(`empty`)이면 원소 없이(서버가 0건 성공), 그 밖은 옛 errorCode를
 * 레지스트리 코드로: 로그인(`pendingLogin`·`login_required`) → SITE_LOGIN_REQUIRED(로그인 문턱이 한 번 로그인한다),
 * 화면 구조(`provider_contract_changed`) → MALL_CONTRACT_CHANGED, 운영자 조치(`operator_action_required`·`pendingAuth`)
 * → OPERATOR_ACTION_REQUIRED, 나머지 → SITE_REQUEST_FAILED. 문장은 몰이 쓴 옛 문장 그대로다.
 */
export function mallExcelRows(
  answer: MallExcelAnswer | null | undefined,
  context: { displayName: string; url: string; fileName: string },
): { rows: unknown[] } {
  const message = answer?.error || `${context.displayName} 주문을 읽지 못했습니다.`;
  if (answer?.success === true) {
    if (answer.empty === true) return { rows: [] };
    const base64 = typeof answer.xlsxBase64 === 'string' ? answer.xlsxBase64.trim() : '';
    if (!base64) {
      throw new RuntimeError(SITE_REQUEST_FAILED, `${context.displayName} 주문 원본 파일이 없습니다.`, { status: null, reason: 'page_error', url: context.url });
    }
    return { rows: filePartRows(answer.fileName || context.fileName, base64) };
  }
  if (answer?.pendingLogin === true || answer?.errorCode === 'login_required') {
    throw new RuntimeError(SITE_LOGIN_REQUIRED, message, { url: context.url });
  }
  if (answer?.errorCode === 'provider_contract_changed') {
    throw new RuntimeError(MALL_CONTRACT_CHANGED, message, { url: context.url });
  }
  if (answer?.pendingAuth === true || answer?.errorCode === 'operator_action_required') {
    throw new RuntimeError(OPERATOR_ACTION_REQUIRED, message, { url: context.url });
  }
  throw new RuntimeError(SITE_REQUEST_FAILED, message, {
    status: null,
    reason: answer?.errorCode === 'network_failed' ? 'network' : 'page_error',
    url: context.url,
  });
}
