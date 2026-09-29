import { ClearCoupangCookiesMessageSchema } from '@kiditem/shared/extension-actions';
import type { z } from 'zod';
import type { EntryAction } from '../../core/dispatch';
import { clearSupplierCookies, type CookieRemover } from '../../sites/coupang-supplier/cookies';

/** `clearCoupangCookies` — 공급사 쿠키를 지운다(값은 읽지 않는다). 파괴적이라 웹이 확인한 뒤에만 온다. */
export function clearCoupangCookiesAction(cookies: CookieRemover): EntryAction<z.infer<typeof ClearCoupangCookiesMessageSchema>> {
  return {
    schema: ClearCoupangCookiesMessageSchema,
    async handle() {
      return { success: true, ...(await clearSupplierCookies(cookies)) };
    },
  };
}
