'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  blockMallAutoLogin,
  clearMallAutoLoginAttempt,
  clearMallAutoLoginBlock,
  isCredentialFailureReason,
} from '@/lib/mall-login-block';
import { recordMallOperationOutcome } from '@/lib/mall-operation-outcomes-api';
import { testMallLoginViaExtension } from '../../order-collection/lib/order-collection-extension';
import { orderMallAccountApi } from '../../order-collection/lib/order-mall-account-api';

export type MallLoginTestOutcome =
  /** 저장된 값을 입력하고 로그인 버튼을 눌렀고, 누른 뒤 로그인 화면이 사라졌다. */
  | 'verified'
  /** 로그인 폼을 만나지 못해 저장된 비밀번호를 검증하지 못했다. */
  | 'unverified'
  | 'failed'
  | 'no_credentials';

/** 확장이 로그인 버튼을 누른 방법. 뒤로 갈수록 취약해 몰 화면이 바뀌면 먼저 깨진다. */
const LOGIN_METHOD_LABEL: Record<string, string> = {
  'onclick-handler': 'onclick 핸들러',
  'exact-text': '로그인 버튼',
  'form-submit-control': 'submit 버튼',
  'form-request-submit': '폼 제출',
  'form-submit': '폼 제출',
  'loose-text': '느슨한 텍스트 일치 ⚠',
  'attribute-match': 'id/class 일치 ⚠',
  'password-enter': 'Enter 키 ⚠ 최후수단',
};

const UNVERIFIED_DETAIL: Record<string, string> = {
  unsupported_mall: '이 몰은 폼 자동 로그인을 지원하지 않아 비밀번호를 확인하지 못했습니다.',
  already_signed_in: '브라우저가 이미 로그인된 상태라 저장된 비밀번호를 확인하지 못했습니다.',
  no_credentials: '저장된 아이디·비밀번호가 없습니다.',
};

export interface MallLoginTestResult {
  outcome: MallLoginTestOutcome;
  detail: string | null;
  at: number;
}

/**
 * 관찰 기록의 이유 코드는 소문자 · 숫자 · 밑줄이다(`^[a-z][a-z0-9_]{0,63}$`). 확장이 준 코드를
 * 그 모양으로 맞춘다 — 맞지 않으면 서버가 거절해 기록이 통째로 사라진다.
 */
export function toLoginTestReasonCode(code: string | null | undefined, fallback: string): string {
  const normalized = (code ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .slice(0, 64);
  return normalized || fallback;
}

/**
 * 로그인 테스트 결과를 관찰 기록에 한 줄 남긴다. 아이디 · 비밀번호는 넣지 않는다.
 * `verified` 는 "폼을 제출했고 로그인 화면이 사라졌다"이지 "세션이 섰다"를 몰에서 확인한 것은
 * 아니라서 이유 코드로 그 차이를 적는다.
 */
function remember(
  mallKey: string,
  outcome: 'succeeded' | 'attention' | 'failed',
  reasonCode: string,
  message: string | null = null,
): void {
  void recordMallOperationOutcome({
    mallKey,
    operation: 'login_test',
    outcome,
    reasonCode,
    message,
  });
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
        remember(mallKey, 'attention', 'no_credentials');
        toast.warning(`${mallName} 비밀번호를 먼저 저장하세요.`);
        return;
      }
      const account = await orderMallAccountApi
        .list()
        .then((accounts) => accounts.find((candidate) => candidate.key === mallKey) ?? null);
      if (!account?.loginId) {
        record(mallKey, { outcome: 'no_credentials', detail: '저장된 아이디가 없습니다.', at: Date.now() });
        remember(mallKey, 'attention', 'no_credentials');
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
      // success 만 보면 안 된다. 로그인 폼을 못 만나 아무것도 입력하지 않은 경우도
      // success 로 돌아오므로, 실제로 제출한 경우만 검증된 것으로 센다.
      // 눌렀지만 로그인 화면이 남아 확인하지 못한 경우. 몰마다 로그인 뒤 화면이 달라 이것만으로
      // 비밀번호가 틀렸다고 단정하지 않는다 — 차단하지 않고 사람에게 확인만 청한다.
      if (result.success && result.submitted && result.verified === false) {
        const detail = '아이디·비밀번호를 넣고 눌렀지만 로그인 화면이 남아 있습니다. 열린 탭에서 확인해 주세요.';
        record(mallKey, { outcome: 'unverified', detail, at: Date.now() });
        remember(mallKey, 'attention', 'login_form_remains', detail);
        toast.warning(`${mallName} 확인 못 함`, { description: detail });
        return;
      }
      if (result.success && result.submitted) {
        const method = result.method ? LOGIN_METHOD_LABEL[result.method] ?? result.method : null;
        record(mallKey, { outcome: 'verified', detail: method, at: Date.now() });
        remember(mallKey, 'succeeded', 'form_submitted', '로그인 폼 제출 뒤 로그인 화면이 사라짐');
        // 사람이 직접 눌러 로그인이 됐다 — 막아 뒀던 자동 로그인을 다시 연다.
        clearMallAutoLoginBlock(mallKey);
        clearMallAutoLoginAttempt(mallKey);
        // 로그인 화면이 사라진 것까지 봤다. 어드민이 실제로 열리는지는 몰에서 확인한다.
        toast.success(`${mallName} 로그인됨`, {
          description: '아이디·비밀번호를 넣고 로그인 버튼을 누른 뒤 로그인 화면이 사라졌습니다. 어드민이 열리는지 한 번 확인하세요.',
        });
        return;
      }
      if (result.success) {
        const detail = UNVERIFIED_DETAIL[result.reason ?? '']
          ?? '로그인 폼을 만나지 못해 비밀번호를 확인하지 못했습니다.';
        record(mallKey, { outcome: 'unverified', detail, at: Date.now() });
        remember(mallKey, 'attention', toLoginTestReasonCode(result.reason, 'form_not_found'), detail);
        toast.warning(`${mallName} 확인 못 함`, { description: detail });
        return;
      }
      // 확장에 닿지 못했다 — 비밀번호가 틀린 게 아니라 테스트를 못 한 것이다. 자동 로그인을 막지
      // 않고, 몰에 대한 관찰도 아니므로 관찰 기록에도 남기지 않는다.
      if (result.unavailable) {
        const detail = result.error ?? '확장에 닿지 못해 로그인 테스트를 하지 못했습니다.';
        record(mallKey, { outcome: 'failed', detail, at: Date.now() });
        toast.error(`${mallName} 로그인 테스트를 하지 못했습니다`, { description: detail });
        return;
      }
      record(mallKey, {
        outcome: 'failed',
        detail: result.error ?? '로그인하지 못했습니다.',
        at: Date.now(),
      });
      remember(mallKey, 'failed', toLoginTestReasonCode(result.errorCode, 'login_failed'), result.error ?? null);
      // 실패한 몰은 더 시도하지 않는다 — 다시 두드리면 계정이 잠긴다. 본인확인 · OTP · 캡차는
      // 자격증명 문제가 아니라 사람이 인증만 하면 되는 상태라 따로 적는다.
      // 우리 쪽이 답하지 못한 실패(요청 한도 초과 등)는 자격증명 문제가 아니라 막지 않는다.
      const failure = result.error ?? '자동 로그인 실패';
      if (!result.pendingLogin && !isCredentialFailureReason(failure)) {
        toast.error(`${mallName} 로그인 테스트를 마치지 못했습니다`, { description: failure });
        return;
      }
      const blockKind = result.pendingLogin ? 'verification' : 'login';
      blockMallAutoLogin(mallKey, failure, blockKind);
      toast.error(
        `${mallName} ${blockKind === 'verification' ? '인증 필요 — 몰에서 직접 인증해 주세요' : '로그인 실패 — 직접 로그인해 주세요'}`,
        {
          description: blockKind === 'verification'
            ? '본인확인 · OTP · 캡차는 사람이 해야 합니다. 인증 후 다시 테스트해 주세요.'
            : '자동 로그인은 이 몰에서 멈춥니다. 직접 로그인한 뒤 다시 테스트해 주세요.',
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : '로그인 테스트를 마치지 못했습니다.';
      record(mallKey, { outcome: 'failed', detail, at: Date.now() });
      remember(mallKey, 'failed', 'test_error', detail);
      toast.error(`${mallName} 로그인 테스트 실패`, { description: detail });
    } finally {
      setTestingKey(null);
    }
  }, [record]);

  return { testingKey, results, test };
}
