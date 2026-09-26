'use client';

import type { OperationView } from '@kiditem/shared/operation';
import { toast } from 'sonner';
import {
  blockMallAutoLogin,
  mallAutoLoginBlock,
  mallAutoLoginRetryAt,
  mallRejectedCredentials,
  markMallAutoLoginAttempt,
} from './mall-login-block';
import { orderMallAccountApi } from './order-mall-account-api';

/**
 * 실행 kind의 사이트 자동 로그인(KID-377). 확장이 실행 안에서 로그인하므로 웹은 수집을 시작할 때 그 몰의 저장 자격을
 * `operation.start`에 실어 보낸다(서버에는 보내지 않는다). 계정이 잠기지 않게 하는 규칙은 옛 몰과 같다 — 막힌 몰에는
 * 보내지 않고, 스스로 도는 수집은 한 시간에 한 번만 보낸다. 끝난 실행이 "몰이 아이디·비밀번호를 거부했다"고 말하면 막는다.
 */
export interface OperationLoginCredentials {
  loginId: string;
  password: string;
  supplierLoginId?: string;
}

export interface OperationLoginAccount {
  key: string;
  name?: string | null;
  loginId?: string | null;
  supplierLoginId?: string | null;
  hasPassword?: boolean;
}

/** 그 몰 하나의 저장 자격. 보내지 않을 때(막힘·간격·저장 안 됨·읽기 실패)는 undefined — 확장은 로그인 화면에서 멈춘다. */
export async function loadOperationLoginCredentials(
  account: OperationLoginAccount,
  { automatic }: { automatic: boolean },
): Promise<OperationLoginCredentials | undefined> {
  const mallName = account.name ?? account.key;
  if (!account.loginId || !account.hasPassword) return undefined;
  // 한 번 거절된 몰은 다시 넣지 않는다(또 두드리면 계정이 잠긴다). 세션이 살아 있으면 로그인 없이도 수집된다.
  if (mallAutoLoginBlock(account.key)) {
    toast.warning(`${mallName} 자동 로그인은 멈춰 있습니다`, {
      description: '한 번 실패해 다시 시도하지 않습니다. 로그인이 풀렸다면 몰에 직접 로그인해 주세요.',
    });
    return undefined;
  }
  // 스스로 도는 수집(자동 운전 · 자동감지)만 간격을 지킨다. 사람이 누른 수집은 언제나 자격을 보낸다.
  if (automatic && mallAutoLoginRetryAt(account.key)) {
    toast.info(`${mallName} 자동 로그인은 조금 전에 시도했습니다`, {
      description: '한 시간에 한 번만 넣습니다. 지금 로그인이 필요하면 몰에 직접 로그인해 주세요.',
    });
    return undefined;
  }
  let password: string | null;
  try {
    ({ password } = await orderMallAccountApi.password(account.key));
  } catch {
    return undefined;
  }
  if (!password) return undefined;
  if (automatic) markMallAutoLoginAttempt(account.key);
  return {
    loginId: account.loginId,
    ...(account.supplierLoginId ? { supplierLoginId: account.supplierLoginId } : {}),
    password,
  };
}

/**
 * 몰 키로 계정을 찾아 저장 자격을 만든다 — 몰 카드 밖에서 시작하는 실행(로켓 계정 `coupang-direct`: 배송요약·로켓 PO·
 * 직배송). 사람이 누른 수집이다. 쿠팡 윙(`coupang`)은 마켓 행이라 이 저장소에 비밀번호가 없다(KID-377 열린 질문).
 */
export async function loadOperationLoginCredentialsForMall(mallKey: string): Promise<OperationLoginCredentials | undefined> {
  let account: OperationLoginAccount | undefined;
  try {
    account = (await orderMallAccountApi.list()).find((candidate) => candidate.key === mallKey);
  } catch {
    return undefined;
  }
  return account ? loadOperationLoginCredentials(account, { automatic: false }) : undefined;
}

/** `requestOperationStart` 옵션 조각: 그 몰 키의 저장 자격이 있으면 `{ credentials }`, 없으면 빈 조각. */
export async function operationLoginOptions(mallKey: string): Promise<{ credentials?: OperationLoginCredentials }> {
  const credentials = await loadOperationLoginCredentialsForMall(mallKey);
  return credentials ? { credentials } : {};
}

/** 로켓 계정의 저장 자격이 있는 몰 키(ADR-0012) — 서플라이어 허브(배송요약·로켓 PO·직배송) 로그인. */
export const ROCKET_LOGIN_MALL_KEY = 'coupang-direct' as const;

/**
 * 로그인 화면에서 멈춘 실행(`SITE_LOGIN_REQUIRED`, `result.login`)이 몰이 아이디·비밀번호를 거부했다고 말하면 그 몰의
 * 자동 로그인을 멈춘다. 확인하지 못한 것·자격 없음·본인확인은 막지 않는다 — 비밀번호가 틀린 게 아니다.
 */
export function noteOperationLoginFailure(account: Pick<OperationLoginAccount, 'key' | 'name'>, operation: OperationView): void {
  if (operation.status !== 'failed' || operation.errorCode !== 'SITE_LOGIN_REQUIRED') return;
  const login = operation.result?.login as { reason?: unknown; mallMessage?: unknown } | undefined;
  const mallMessage = typeof login?.mallMessage === 'string' ? login.mallMessage : null;
  if (login?.reason !== 'credentials_rejected' || !mallRejectedCredentials(mallMessage)) return;
  const mallName = account.name ?? account.key;
  blockMallAutoLogin(account.key, mallMessage ?? '몰이 아이디·비밀번호를 거부했습니다.');
  toast.error(`${mallName} 로그인 실패 — 저장된 아이디·비밀번호를 고쳐 주세요`, { description: `${mallName}: ${mallMessage}` });
}
