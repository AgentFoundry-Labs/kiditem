/**
 * 스펙용 — 몰 관리자 목록 처리기 파일(`content/orders/<mall>-listings.js`, KID-381)을 실제 파일 그대로 돌린다. 가짜는 페이지
 * 경계(fetch·location·document·localStorage·화면 함수)뿐이고, 기다림(`setTimeout`)은 바로 지나간다. ISOLATED 처리기는
 * `globalThis.__kiditemIsolatedPageCalls`, MAIN 처리기는 `window.__kiditemPageCalls`에 등록된다 — 둘 다 같은 표로 모은다.
 * DOM 파서가 필요한 몰은 스펙이 `// @vitest-environment jsdom`으로 전역 `DOMParser`를 둔다.
 */
export function listingsPageCall(source: string, call: string, globals: Record<string, unknown> = {}) {
  const calls: Record<string, (args: unknown) => Promise<unknown>> = {};
  const window = Object.assign((globals.window as Record<string, unknown> | undefined) ?? {}, { __kiditemPageCalls: calls });
  const scope: Record<string, unknown> = {
    setTimeout: (callback: () => void) => setTimeout(callback, 0),
    ...globals,
    globalThis: { __kiditemIsolatedPageCalls: calls },
    window,
  };
  const names = Object.keys(scope);
  new Function(...names, source)(...names.map((name) => scope[name]));
  const handler = calls[call];
  if (!handler) throw new Error(`no page call ${call}`);
  return async (plan: Record<string, unknown>) => JSON.parse(JSON.stringify(await handler({ plan: structuredClone(plan) }))) as Record<string, any>;
}
