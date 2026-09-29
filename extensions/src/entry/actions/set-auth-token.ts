import { SetAuthTokenMessageSchema } from '@kiditem/shared/extension-actions';
import type { z } from 'zod';
import type { AuthStore } from '../../core/auth-store';
import type { EntryAction } from '../../core/dispatch';

/** `setAuthToken` — 웹이 보낸 세션 토큰을 보내는 창의 환경 프로필에 둔다. 응답에 토큰을 싣지 않는다. */
export function setAuthTokenAction(store: AuthStore): EntryAction<z.infer<typeof SetAuthTokenMessageSchema>> {
  return {
    schema: SetAuthTokenMessageSchema,
    async handle(input, { environmentId }) {
      await store.setAccessToken(environmentId, input.token);
      return { success: true, environmentId };
    },
  };
}
