import { CheckMallLoginMessageSchema } from '@kiditem/shared/extension-actions';
import type { z } from 'zod';
import type { EntryAction } from '../../core/dispatch';
import { checkMallLogin, type MallLoginCheckDeps } from '../../sites/mall-session/check';

/** `checkMallLogin` — 몰 로그인 상태를 셋 중 하나와 이유 코드로 답한다. 로그인은 하지 않고 자격도 받지 않는다. */
export function checkMallLoginAction(deps: MallLoginCheckDeps): EntryAction<z.infer<typeof CheckMallLoginMessageSchema>> {
  return {
    schema: CheckMallLoginMessageSchema,
    async handle(input) {
      const { state, reason } = await checkMallLogin(deps, input.mallKey, input.siteUrl);
      return { success: true, mallKey: input.mallKey, state, reason };
    },
  };
}
