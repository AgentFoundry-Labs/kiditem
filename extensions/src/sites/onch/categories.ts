import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';

/**
 * 몰 분류 목록 한 단(KID-366, 옛 `orders/mall-utility-actions.js` `listCategories` 이식). 온채널 상품등록 화면의 계단식 4단
 * 분류를 단계마다 앞 단계 이름으로 다음 목록을 받는다. 서비스워커가 몰 관리자 쿠키로 읽기만 한다 — 폼을 열지도 값을 넣지도 않는다.
 * 온채널은 앞 단계를 이름으로 받으므로 `id`도 이름이다.
 */
const SOURCES = {
  onch: {
    origin: 'https://www.onch3.co.kr',
    path: '/access/ajax_pending_product_access.php',
    fixed: { ubr: 'getCategory' },
    depthParam: 'depth',
    levelParams: ['cate_first', 'cate_second', 'cate_third'],
    itemsKey: 'datas',
    nameKey: 'name',
    levels: 4,
  },
} as const;

export const CATEGORY_MALL_KEYS = Object.keys(SOURCES);

export interface MallCategory {
  id: string;
  name: string;
  hasChildren: boolean;
}

export async function listMallCategories(
  deps: { fetch(url: string, init?: RequestInit): Promise<Response> },
  mall: string,
  path: readonly string[],
): Promise<MallCategory[]> {
  const source = Object.prototype.hasOwnProperty.call(SOURCES, mall) ? SOURCES[mall as keyof typeof SOURCES] : null;
  if (!source) throw new RuntimeError('VALIDATION_FAILED', '분류 목록을 제공하지 않는 몰입니다.', { fields: ['mall'] });
  if (path.length >= source.levels) return [];
  const query = new URLSearchParams({ ...source.fixed });
  query.set(source.depthParam, String(path.length));
  path.forEach((value, index) => {
    const name = source.levelParams[index];
    if (name) query.set(name, value);
  });
  const url = `${source.origin}${source.path}?${query.toString()}`;
  const response = await deps.fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new RuntimeError(SITE_REQUEST_FAILED, '몰 분류 목록을 읽지 못했습니다.', { status: response.status, url: source.path, reason: 'http', bodyHead: null });
  }
  const body = (await response.json()) as Record<string, unknown> | null;
  // 온채널은 로그아웃 상태에서도 200으로 `{isSuccess:false, msg}`를 준다(wave8a QA) — 빈 목록이 아니라 로그인 필요다.
  if (body?.isSuccess === false) {
    throw new RuntimeError(SITE_LOGIN_REQUIRED, '몰 관리자에 로그인되어 있지 않아 분류 목록을 읽지 못했습니다.', {
      url: source.path, mallMessage: typeof body.msg === 'string' ? body.msg.slice(0, 200) : null,
    });
  }
  const rows = Array.isArray(body?.[source.itemsKey]) ? (body![source.itemsKey] as unknown[]) : [];
  const hasChildren = path.length + 1 < source.levels;
  return rows
    .map((row) => String((row as Record<string, unknown> | null)?.[source.nameKey] ?? '').trim())
    .filter(Boolean)
    .map((name) => ({ id: name, name, hasChildren }));
}
