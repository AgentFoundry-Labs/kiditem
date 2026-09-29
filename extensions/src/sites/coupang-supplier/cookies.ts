import { COUPANG_SUPPLIER_ORIGIN } from './page';

/**
 * 쿠키 과다(400/413/431) 복구(옛 `orders/worker.js` `clearCoupangSupplierCookies`). 쿠팡을 오래 쓰면 쿠키가 쌓여 요청 헤더가
 * 서버 상한을 넘는다 — 다시 시도해도 풀리지 않으므로 supplier.coupang.com에 걸리는 쿠키를 지운다(정리 뒤 다시 로그인).
 * 쿠키 **값은 읽지 않는다**: 이름·경로·저장소로만 지우고 돌려주는 것은 개수뿐이다. 파괴적이라 웹이 확인한 뒤에만 부른다.
 */
export interface CookieRemover {
  getAll(details: { url: string }): Promise<Array<{ name: string; path?: string; storeId?: string }>>;
  remove(details: { url: string; name: string; storeId?: string }): Promise<unknown>;
}

export async function clearSupplierCookies(cookies: CookieRemover): Promise<{ cleared: number; total: number }> {
  const found = await cookies.getAll({ url: `${COUPANG_SUPPLIER_ORIGIN}/` });
  let cleared = 0;
  for (const cookie of found) {
    // `.coupang.com` 도메인 쿠키와 경로별 쿠키까지 지우도록 supplier 호스트에 그 쿠키의 경로를 붙인다.
    const url = `${COUPANG_SUPPLIER_ORIGIN}${cookie.path || '/'}`;
    try {
      await cookies.remove({ url, name: cookie.name, ...(cookie.storeId !== undefined ? { storeId: cookie.storeId } : {}) });
      cleared += 1;
    } catch {
      // 하나가 실패해도 나머지를 지운다.
    }
  }
  return { cleared, total: found.length };
}
