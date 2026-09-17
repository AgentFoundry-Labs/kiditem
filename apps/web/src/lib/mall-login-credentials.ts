import { apiClient } from '@/lib/api-client';

/**
 * 몰 자동 로그인 자격증명 읽기.
 *
 * 값은 **사장님이 쇼핑몰 계정 설정에 저장한 것**이고, 서버가 들고 있다. 여기서는 필요한
 * 순간에 한 번 읽어 확장에 그대로 넘기기만 한다 — 화면 상태에도, 로컬 저장소에도,
 * 로그에도 남기지 않는다.
 *
 * 저장·수정은 주문수집의 쇼핑몰 계정 화면이 소유한다. 이 파일은 읽기 전용이다.
 *
 * ⚠️ 비밀번호가 담긴 객체다. 토스트·에러 메시지·분석 이벤트에 절대 싣지 말 것.
 */

export interface MallLoginCredentials {
  loginId: string;
  /** 공급사 로그인이 따로 있는 몰(온채널 등). */
  supplierLoginId?: string;
  password: string;
}

interface MallAccountRow {
  key: string;
  loginId: string | null;
  supplierLoginId?: string | null;
  hasPassword: boolean;
  enabled: boolean;
}

/**
 * 그 몰의 자격증명. 저장해 둔 것이 없으면 `null` 이다.
 *
 * `null` 은 실패가 아니다 — 자동 로그인을 하지 않고 지금 열려 있는 세션에 기대는,
 * 예전과 같은 동작이라는 뜻이다.
 */
export async function loadMallLoginCredentials(
  mallKey: string,
): Promise<MallLoginCredentials | null> {
  try {
    const accounts = await apiClient.get<MallAccountRow[]>('/api/orders/collection/malls');
    const account = accounts.find((row) => row.key === mallKey);
    if (!account?.loginId || !account.hasPassword) return null;

    const { password } = await apiClient.get<{ key: string; password: string | null }>(
      `/api/orders/collection/malls/${encodeURIComponent(mallKey)}/password`,
    );
    if (!password) return null;

    return {
      loginId: account.loginId,
      ...(account.supplierLoginId ? { supplierLoginId: account.supplierLoginId } : {}),
      password,
    };
  } catch {
    // 계정을 못 읽는 것은 등록을 막을 이유가 아니다. 세션이 살아 있으면 그대로 된다.
    return null;
  }
}
