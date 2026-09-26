import { KiditemInvalidValueError, KiditemNotFoundError, operatorErrorText } from '@kiditem/shared/errors';
import type { z } from 'zod';
import type { ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';

/** kind scope를 검증한다. 어긋나면 `VALIDATION_FAILED{invalid_scope}`(항목별 까닭 포함). */
export function parseOperationScope<T extends z.ZodTypeAny>(schema: T, scope: unknown): z.infer<T> {
  const parsed = schema.safeParse(scope);
  if (!parsed.success) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', {
      details: {
        reason: 'invalid_scope',
        errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
      },
    });
  }
  return parsed.data;
}

/** Wing 검색 kind의 계정이 이 조직의 켜진 쿠팡 계정인가(Channels 공개 포트). 아니면 `ADVERTISING_ACCOUNT_NOT_FOUND`. */
export async function assertActiveCoupangAccount(accounts: ChannelAccountPort, organizationId: string, channelAccountId: string): Promise<void> {
  const active = await accounts.listActive(organizationId);
  if (!active.some((account) => account.id === channelAccountId && account.channel === 'coupang')) {
    throw new KiditemNotFoundError('ADVERTISING_ACCOUNT_NOT_FOUND', { details: { channelAccountId } });
  }
}

/** 최종 실패 알림 문장: 코드의 레지스트리 문장(원문 errorMessage는 싣지 않는다 — 운영자 문장 규칙). */
export function failureMessage(context: { errorCode: string }, sourceType: string): string {
  return operatorErrorText({ code: context.errorCode, source: sourceType });
}
