import { describe, expect, it } from 'vitest';
import { listMallCategories } from './categories';

describe('온채널 분류 목록(KID-366 listMallCategories, 옛 mall-utility-actions 이식)', () => {
  it('단계마다 앞 단계 값을 실어 {id, name, hasChildren}을 돌려준다(4단)', async () => {
    const calls: Array<[string, RequestCredentials | undefined]> = [];
    const fetch = async (url: string, init: RequestInit = {}) => {
      calls.push([url, init.credentials]);
      return Response.json({ datas: [{ name: '완구' }, { name: ' 문구 ' }, { name: '' }] });
    };
    await expect(listMallCategories({ fetch }, 'onch', ['유아동', '장난감'])).resolves.toEqual([
      { id: '완구', name: '완구', hasChildren: true },
      { id: '문구', name: '문구', hasChildren: true },
    ]);
    const url = new URL(calls[0]![0]);
    expect(url.origin + url.pathname).toBe('https://www.onch3.co.kr/access/ajax_pending_product_access.php');
    expect(url.search.slice(1).split("&").map((pair) => pair.split("=").map(decodeURIComponent))).toEqual([['ubr', 'getCategory'], ['depth', '2'], ['cate_first', '유아동'], ['cate_second', '장난감']]);
    expect(calls[0]![1]).toBe('include');
    await expect(listMallCategories({ fetch }, 'onch', ['a', 'b', 'c'])).resolves.toEqual([
      { id: '완구', name: '완구', hasChildren: false },
      { id: '문구', name: '문구', hasChildren: false },
    ]);
    calls.length = 0;
    await expect(listMallCategories({ fetch }, 'onch', ['a', 'b', 'c', 'd'])).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });

  it('로그아웃 상태의 200 {isSuccess:false}는 빈 목록이 아니라 SITE_LOGIN_REQUIRED다(자격 없음)', async () => {
    const fetch = async () => Response.json({ isSuccess: false, msg: '변경 사항이 없거나 처리가 실패하였습니다.' });
    await expect(listMallCategories({ fetch }, 'onch', [])).rejects.toMatchObject({
      code: 'SITE_LOGIN_REQUIRED',
      details: { mallMessage: '변경 사항이 없거나 처리가 실패하였습니다.' },
    });
  });

  it('다른 몰은 VALIDATION_FAILED, 몰의 HTTP 실패는 SITE_REQUEST_FAILED', async () => {
    await expect(listMallCategories({ fetch: async () => Response.json({}) }, 'domeggook', [])).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(listMallCategories({ fetch: async () => new Response('', { status: 500 }) }, 'onch', [])).rejects.toMatchObject({ code: 'SITE_REQUEST_FAILED' });
  });
});
