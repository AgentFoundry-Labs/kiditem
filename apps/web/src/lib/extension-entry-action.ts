import type { z } from 'zod';
import {
  ExtensionActionFailureSchema,
  type ExtensionActionFailure,
} from '@kiditem/shared/extension-actions';
import { sendToExtension } from './extension-bridge';

/**
 * 확장 답이 shared `extension-actions` 계약과 다르다 — 확장과 웹 빌드가 서로 맞지 않는다는 뜻이다.
 * 몰이 실패한 것도, 로그인이 풀린 것도 아니다. 부르는 쪽은 '확장을 다시 불러오라'로 다룬다.
 */
export class ExtensionContractError extends Error {
  /** `false`면 확장이 아무것도 돌려주지 않았다(답 없음). */
  constructor(readonly action: string, readonly answered: boolean) {
    super('확장 답이 약속한 모양과 다릅니다. 확장을 다시 불러온 뒤 이 화면도 새로고침해 주세요.');
    this.name = 'ExtensionContractError';
  }
}

/** 보낼 메시지가 계약에 맞지 않는다(예: 저장된 사이트 주소가 주소 모양이 아님). 확장에 보내지 않았다. */
export class ExtensionMessageInvalidError extends Error {
  constructor() {
    super('확장에 보낼 값이 올바르지 않아 보내지 않았습니다.');
    this.name = 'ExtensionMessageInvalidError';
  }
}

export interface ExtensionEntryContract<M extends z.ZodTypeAny, R extends z.ZodTypeAny> {
  message: M;
  response: R;
}

/**
 * 확장 새 런타임의 entry 액션(한 번에 끝나는 호출)을 shared 계약으로 보내고 받는다(KID-366).
 * 보낼 메시지를 계약으로 만들고, 답은 계약의 성공 모양이나 공용 실패 봉투만 받는다.
 * 그 밖의 답·무응답은 `ExtensionContractError`다. 전송 실패(시간 초과 등)는 그대로 던진다.
 */
export async function sendExtensionEntryAction<M extends z.ZodTypeAny, R extends z.ZodTypeAny>(
  extensionId: string,
  contract: ExtensionEntryContract<M, R>,
  message: z.input<M>,
  timeoutMs: number,
): Promise<z.output<R> | ExtensionActionFailure> {
  // 값을 오류에 싣지 않는다 — 로그인 테스트 메시지에는 자격이 들어 있다.
  const parsed = contract.message.safeParse(message);
  if (!parsed.success) throw new ExtensionMessageInvalidError();
  const outgoing = parsed.data as { action: string };
  const answer = await sendToExtension<unknown>(extensionId, outgoing, timeoutMs);
  const success = contract.response.safeParse(answer);
  if (success.success) return success.data as z.output<R>;
  const failure = ExtensionActionFailureSchema.safeParse(answer);
  if (failure.success) return failure.data;
  throw new ExtensionContractError(outgoing.action, answer !== undefined && answer !== null);
}
