import { ListMallCategoriesMessageSchema } from '@kiditem/shared/extension-actions';
import type { z } from 'zod';
import type { EntryAction } from '../../core/dispatch';
import { listMallCategories } from '../../sites/onch/categories';

/** `listMallCategories` — 몰 분류 목록 한 단을 몰 관리자 쿠키로 읽는다(읽기만). */
export function listMallCategoriesAction(deps: { fetch(url: string, init?: RequestInit): Promise<Response> }): EntryAction<z.infer<typeof ListMallCategoriesMessageSchema>> {
  return {
    schema: ListMallCategoriesMessageSchema,
    async handle(input) {
      return { success: true, categories: await listMallCategories(deps, input.mall, input.path) };
    },
  };
}
