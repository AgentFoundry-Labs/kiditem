import {
  RocketPoSourceAttemptSchema,
  RocketPoSourceBeginSchema,
  RocketPoSourceSchema,
  RocketSavedPoCollectionSchema,
  ROCKET_SAVED_PO_RESPONSE_PROFILE,
  type RocketPoSourceAttempt,
} from '@kiditem/shared/rocket-purchase-preview';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { detectOrderCollectionExtensionRuntime, sendToExtension } from '@/lib/extension-bridge';
import { transferExtensionAuthTo } from '@/lib/extension-auth';

const BASE = '/api/channels/rocket-po';

export class RocketPoSourceError extends Error {
  constructor(readonly attempt: RocketPoSourceAttempt) {
    super(attempt.errorMessage ?? (attempt.state === 'RUNNING'
      ? '로켓 PO 수집이 진행 중입니다. 서버 상태를 확인해주세요.'
      : '로켓 PO 수집에 실패했습니다.'));
    this.name = 'RocketPoSourceError';
  }
}

export function loadRocketPoSource(channelAccountId: string) {
  return apiClient.getParsed(
    BASE + '/source?channelAccountId=' + encodeURIComponent(channelAccountId),
    RocketPoSourceSchema,
  );
}

export async function collectRocketPoRowsForConfirmationFromExtension(input: {
  channelAccountId: string;
  from: string;
  to: string;
  idempotencyKey: string;
  onAttempt?: (attempt: RocketPoSourceAttempt) => void;
}) {
  const request = RocketPoSourceBeginSchema.parse({
    channelAccountId: input.channelAccountId, from: input.from, to: input.to,
    status: '', dateType: 'WAREHOUSING_PLAN_DATE', requireConfirmation: true,
  });
  const runtime = await detectOrderCollectionExtensionRuntime(1200, ['coupangRocketPoSourceOwnerV1']);
  if (runtime.status === 'incompatible') {
    throw new Error('주문수집 확장프로그램이 이전 버전입니다. extensions/kiditem-os 를 새로고침한 뒤 다시 시도해주세요.');
  }
  if (runtime.status !== 'ready') {
    throw new Error('주문수집 확장프로그램을 찾지 못했습니다. extensions/kiditem-os 를 로드하고 supplier.coupang.com 로그인 후 다시 시도해주세요.');
  }
  await transferExtensionAuthTo(runtime.extensionId);
  const begin = () => apiClient.post(BASE + '/attempts', request, {
    headers: { 'Idempotency-Key': input.idempotencyKey },
  });
  let raw: unknown;
  try { raw = await begin(); }
  catch (cause) {
    if (!isApiError(cause) || (cause.status !== 0 && cause.status < 500)) throw cause;
    raw = await begin();
  }
  // Control may include a write token. The page projects only safe attempt
  // metadata; the extension independently reads its own fenced control.
  const started = RocketPoSourceAttemptSchema.strip().parse(raw);
  if (started.channelAccountId !== input.channelAccountId) throw new Error('로켓 계정 수집 식별자가 일치하지 않습니다.');
  input.onAttempt?.(started);
  if (started.state === 'RUNNING') {
    await sendToExtension(runtime.extensionId, {
      action: 'collectRocketPoRows', attemptId: started.attemptId,
    }, 190000).catch(() => undefined);
  }
  // Even a lost callback or a success reply is not canonical acknowledgement.
  const terminal = await apiClient.getParsed(
    BASE + '/attempts/' + started.attemptId, RocketPoSourceAttemptSchema.strip(),
  ).catch((cause: unknown) => {
    if (started.state === 'RUNNING' && isApiError(cause) && (cause.status === 0 || cause.status >= 500)) {
      throw new RocketPoSourceError(started);
    }
    throw cause;
  });
  if (terminal.attemptId !== started.attemptId || terminal.channelAccountId !== input.channelAccountId) {
    throw new Error('로켓 수집본의 서버 식별자가 일치하지 않습니다.');
  }
  input.onAttempt?.(terminal);
  if (terminal.state !== 'COMPLETE') throw new RocketPoSourceError(terminal);
  const saved = RocketSavedPoCollectionSchema.parse(await apiClient.post('/api/purchase-orders', {
    action: 'loadSavedRocketCollection', channelAccountId: input.channelAccountId, sourceImportRunId: terminal.attemptId,
  }, { headers: { 'X-KidItem-Response-Profile': ROCKET_SAVED_PO_RESPONSE_PROFILE } }));
  if (saved.sourceImportRunId !== terminal.attemptId || saved.channelAccountId !== input.channelAccountId) {
    throw new Error('저장된 로켓 수집본의 식별자가 일치하지 않습니다.');
  }
  return { ...saved, poCount: saved.collection.detailPoCount };
}
