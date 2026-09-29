import { HostPublicImagesResponseSchema, ListMallCategoriesResponseSchema } from '@kiditem/shared/extension-actions';
import { describe, expect, it } from 'vitest';
import type { ActionContext } from '../../core/dispatch';
import { hostPublicImagesAction } from './host-public-images';
import { listMallCategoriesAction } from './list-mall-categories';

const context: ActionContext = { environmentId: 'office', sender: { url: 'http://kiditem-office/' } };

describe('몰 보조 entry 액션(사진 호스팅·분류 목록)', () => {
  it('listMallCategories: 경로 없으면 최상위, 응답은 shared 모양', async () => {
    const action = listMallCategoriesAction({ fetch: async () => Response.json({ datas: [{ name: '유아동' }] }) });
    const parsed = action.schema.safeParse({ action: 'listMallCategories', mall: 'onch' });
    expect(parsed.success && parsed.data.path).toEqual([]);
    const response = await action.handle(parsed.success ? parsed.data : (undefined as never), context);
    expect(ListMallCategoriesResponseSchema.parse(response)).toEqual({ success: true, categories: [{ id: '유아동', name: '유아동', hasChildren: true }] });
  });

  it('hostPublicImages: 스키마가 20장을 넘는 요청을 거절하고, 응답은 shared 모양', async () => {
    const action = hostPublicImagesAction({ fetch: async () => new Response(new Blob(['x'], { type: 'text/plain' })) });
    expect(action.schema.safeParse({ action: 'hostPublicImages', urls: Array.from({ length: 21 }, (_, i) => `http://localhost:9000/${i}.jpg`) }).success).toBe(false);
    const parsed = action.schema.safeParse({ action: 'hostPublicImages', urls: ['http://localhost:9000/a.jpg'] });
    const response = await action.handle(parsed.success ? parsed.data : (undefined as never), context);
    expect(HostPublicImagesResponseSchema.parse(response).images).toEqual([{ sourceUrl: 'http://localhost:9000/a.jpg', publicUrl: null, error: '사진 파일이 아닙니다.' }]);
  });
});
