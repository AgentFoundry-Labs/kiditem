'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  blockMallAutoLogin,
  clearMallAutoLoginAttempt,
  clearMallAutoLoginBlock,
  mallRejectedCredentials,
} from '@/lib/mall-login-block';
import { operatorErrorText } from '@/lib/operator-error';
import { testMallLoginViaExtension } from '../../order-collection/lib/order-collection-extension';
import { orderMallAccountApi } from '@/lib/order-mall-account-api';

export type MallLoginTestOutcome =
  /** 저장된 값을 입력하고 로그인 버튼을 눌렀고, 누른 뒤 로그인 화면이 사라졌다. */
  | 'verified'
  /** 로그인 폼을 만나지 못해 저장된 비밀번호를 검증하지 못했다. */
  | 'unverified'
  | 'failed'
  | 'no_credentials';

/**
 * 확장이 로그인 테스트 결과로 내는 registry 코드(@kiditem/shared/extension-actions `TestMallLoginResponseSchema`).
 * 거절만 비밀번호 문제로 막고, 본인확인은 사람이 인증할 때까지 기다린다. 나머지는 확인하지 못한 것이다.
 */
const LOGIN_REJECTED_CODE = 'MALL_LOGIN_REJECTED';
const VERIFICATION_REQUIRED_CODE = 'SITE_VERIFICATION_REQUIRED';
const COULD_NOT_CHECK_CODES: ReadonlySet<string> = new Set([
  'MALL_LOGIN_UNSUPPORTED',
  'MALL_CONTRACT_CHANGED',
  'MALL_LOGIN_UNCONFIRMED',
  'MALL_LOGIN_PAGE_UNREACHABLE',
]);

export interface MallLoginTestResult {
  outcome: MallLoginTestOutcome;
  detail: string | null;
  /** 저장된 아이디·비밀번호를 넣고 로그인 버튼을 눌렀는가(`verified`일 때만 참). */
  submitted?: boolean;
  at: number;
}

/**
 * 저장된 계정으로 확장이 실제 로그인까지 해보고 결과만 남긴다.
 *
 * 비밀번호는 테스트를 누른 그 몰 하나만 그때 불러온다. 표를 열었다고 27개
 * 비밀번호를 미리 받아두지 않는다.
 */
export function useMallLoginTest() {
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, MallLoginTestResult>>({});

  const record = useCallback((mallKey: string, result: MallLoginTestResult) => {
    setResults((current) => ({ ...current, [mallKey]: result }));
  }, []);

  const test = useCallback(async (mallKey: string, mallName: string) => {
    setTestingKey(mallKey);
    try {
      const { password } = await orderMallAccountApi.password(mallKey);
      if (!password) {
        record(mallKey, { outcome: 'no_credentials', detail: '저장된 비밀번호가 없습니다.', at: Date.now() });
        toast.warning(`${mallName} 비밀번호를 먼저 저장하세요.`);
        return;
      }
      const account = await orderMallAccountApi
        .list()
        .then((accounts) => accounts.find((candidate) => candidate.key === mallKey) ?? null);
      if (!account?.loginId) {
        record(mallKey, { outcome: 'no_credentials', detail: '저장된 아이디가 없습니다.', at: Date.now() });
        toast.warning(`${mallName} 아이디를 먼저 저장하세요.`);
        return;
      }
      const result = await testMallLoginViaExtension(mallKey, {
        loginId: account.loginId,
        ...(account.supplierLoginId ? { supplierLoginId: account.supplierLoginId } : {}),
        password,
        // 확장에 고정 로그인 주소가 없는 몰은 저장된 사이트 주소로 들어가 로그인한다.
        ...(account.siteUrl ? { siteUrl: account.siteUrl } : {}),
      });
      // 확장에 닿지 못했다 — 비밀번호가 틀린 게 아니라 테스트를 못 한 것이다. 자동 로그인을 막지 않는다.
      if (result.unavailable) {
        const detail = result.error ?? '확장에 닿지 못해 로그인 테스트를 하지 못했습니다.';
        record(mallKey, { outcome: 'failed', detail, at: Date.now() });
        toast.error(`${mallName} 로그인 테스트를 하지 못했습니다`, { description: detail });
        return;
      }
      const code = result.errorCode ?? null;
      const withMallMessage = (text: string) => (result.mallMessage ? `${mallName}: ${result.mallMessage}` : text);
      // 몰이 거절했다 — 확장의 판정이든 몰이 알림 창으로 남긴 말이든. 같은 값을 다시 넣으면 계정이 잠긴다.
      if (code === LOGIN_REJECTED_CODE || mallRejectedCredentials(result.mallMessage)) {
        const detail = withMallMessage(operatorErrorText({ code: LOGIN_REJECTED_CODE }));
        record(mallKey, { outcome: 'failed', detail, at: Date.now() });
        blockMallAutoLogin(mallKey, result.mallMessage ?? '몰이 아이디·비밀번호를 거부했습니다.');
        toast.error(`${mallName} 아이디·비밀번호가 맞지 않습니다`, {
          description: `${detail} — 저장된 값을 고친 뒤 다시 테스트해 주세요.`,
        });
        return;
      }
      // 본인확인 · OTP · 캡차는 자격증명 문제가 아니라 사람이 인증만 하면 되는 상태다.
      if (code === VERIFICATION_REQUIRED_CODE) {
        const detail = operatorErrorText({ code });
        record(mallKey, { outcome: 'failed', detail, at: Date.now() });
        blockMallAutoLogin(mallKey, detail, 'verification');
        toast.error(`${mallName} 인증 필요 — 몰에서 직접 인증해 주세요`, {
          description: '본인확인 · OTP · 캡차는 사람이 해야 합니다. 인증 후 다시 테스트해 주세요.',
        });
        return;
      }
      // 확인하지 못했다 — 몰마다 로그인 뒤 화면이 달라 이것만으로 비밀번호가 틀렸다고 단정하지 않는다.
      if (code !== null && COULD_NOT_CHECK_CODES.has(code)) {
        const detail = withMallMessage(operatorErrorText({ code }));
        record(mallKey, { outcome: 'unverified', detail, at: Date.now() });
        toast.warning(`${mallName} 확인 못 함`, { description: detail });
        return;
      }
      // 로그인 폼을 보내고 로그인 화면이 사라졌다.
      if (result.success && result.submitted && result.verified && code === null) {
        record(mallKey, { outcome: 'verified', detail: null, submitted: true, at: Date.now() });
        clearMallAutoLoginBlock(mallKey);
        clearMallAutoLoginAttempt(mallKey);
        toast.success(`${mallName} 로그인됨`, {
          description: '아이디·비밀번호를 넣고 로그인 버튼을 누른 뒤 로그인 화면이 사라졌습니다. 어드민이 열리는지 한 번 확인하세요.',
        });
        return;
      }
      // 브라우저가 이미 로그인돼 있다 — 저장된 비밀번호를 넣어 보지 않았으니 막아 둔 자동 로그인을 풀지 않는다
      // (같은 값으로 다시 두드리면 계정이 잠긴다).
      if (result.success && result.verified && code === null) {
        const detail = '브라우저가 이미 로그인되어 있어 저장된 비밀번호를 확인하지 못했습니다.';
        record(mallKey, { outcome: 'unverified', detail, submitted: false, at: Date.now() });
        toast.warning(`${mallName} 확인 못 함`, { description: detail });
        return;
      }
      if (result.success) {
        const detail = withMallMessage('로그인 결과를 확인하지 못했습니다. 열린 탭에서 확인해 주세요.');
        record(mallKey, { outcome: 'unverified', detail, at: Date.now() });
        toast.warning(`${mallName} 확인 못 함`, { description: detail });
        return;
      }
      // 확장이 실패 봉투로 답했다 — 우리 쪽이 끝내지 못한 것이지 비밀번호 문제가 아니다. 막지 않는다.
      const detail = code ? operatorErrorText({ code }) : (result.error ?? '로그인 테스트를 마치지 못했습니다.');
      record(mallKey, { outcome: 'failed', detail, at: Date.now() });
      toast.error(`${mallName} 로그인 테스트를 마치지 못했습니다`, { description: detail });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '로그인 테스트를 마치지 못했습니다.';
      record(mallKey, { outcome: 'failed', detail, at: Date.now() });
      toast.error(`${mallName} 로그인 테스트 실패`, { description: detail });
    } finally {
      setTestingKey(null);
    }
  }, [record]);

  return { testingKey, results, test };
}
