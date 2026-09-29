import { ClearAuthTokenMessageSchema } from '@kiditem/shared/extension-actions';
import type { z } from 'zod';
import type { AuthStore } from '../../core/auth-store';
import type { EntryAction } from '../../core/dispatch';

/** `clearAuthToken` — 로그아웃한 웹 창의 환경 프로필만 지운다. */
export function clearAuthTokenAction(store: AuthStore): EntryAction<z.infer<typeof ClearAuthTokenMessageSchema>> {
  return {
    schema: ClearAuthTokenMessageSchema,
    async handle(_input, { environmentId }) {
      await store.clearAccessToken(environmentId);
      return { success: true, environmentId };
    },
  };
}
