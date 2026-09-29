import { TestMallLoginMessageSchema } from '@kiditem/shared/extension-actions';
import type { z } from 'zod';
import type { EntryAction } from '../../core/dispatch';
import type { LoginDeps } from '../../sites/site-login';
import { testMallLogin } from '../../sites/mall-session/test-login';
import type { TabPages } from '../../sites/tab-page';

/**
 * `testMallLogin` — 쇼핑몰 계정 화면의 로그인 테스트. 웹이 실어 보낸 저장 자격은 이 호출 동안 메모리에만 두고 사이트 로그인에만
 * 넘긴다 — 응답·로그·오류 details에 싣지 않는다(실행 `credentials`와 같은 규칙).
 */
export function testMallLoginAction(deps: LoginDeps & { tabs: TabPages }): EntryAction<z.infer<typeof TestMallLoginMessageSchema>> {
  return {
    schema: TestMallLoginMessageSchema,
    async handle(input) {
      return { success: true, ...(await testMallLogin(deps, input.mallKey, input.credentials, input.siteUrl)) };
    },
  };
}
