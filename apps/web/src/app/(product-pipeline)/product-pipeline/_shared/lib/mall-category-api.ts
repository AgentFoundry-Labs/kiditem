import {
  LIST_MALL_CATEGORIES_ACTION,
  ListMallCategoriesMessageSchema,
  ListMallCategoriesResponseSchema,
  MALL_CATEGORY_READ_CAPABILITY,
} from '@kiditem/shared/extension-actions';
import { detectOrderCollectionExtensionId } from '@/lib/extension-bridge';
import { sendExtensionEntryAction } from '@/lib/extension-entry-action';
import type { MallFormRegisterMall } from './mall-form-registration-api';

/**
 * 몰 분류 목록 한 단.
 *
 * 트리를 통째로 받아 두지 않는다. 온채널 4단은 마디가 3만 개가 넘고 전부 받으려면
 * 요청이 3,600건이다(실측 2026-09-10: 1단 11 · 2단 242 · 3단 약 3,400). 파일로
 * 들고 다니면 그날부터 낡기 시작하고, 화면을 여는 사람마다 그 무게를 낸다.
 *
 * 대신 사람이 한 단 고를 때마다 그 단만 묻는다 — 한 상품에 네 번이다.
 */

const CATEGORY_TIMEOUT_MS = 15000;

const LIST_CATEGORIES = { message: ListMallCategoriesMessageSchema, response: ListMallCategoriesResponseSchema };

export async function listMallCategories(
  mall: MallFormRegisterMall,
  path: readonly string[],
): Promise<string[]> {
  const extensionId = await detectOrderCollectionExtensionId(1200, MALL_CATEGORY_READ_CAPABILITY);
  if (!extensionId) {
    throw new Error('확장프로그램이 필요합니다. 몰 분류는 몰에서 직접 읽어옵니다.');
  }

  // 화면은 분류 이름으로 한 단씩 고른다 — 온채널은 분류 id가 곧 이름이다(shared 계약, KID-366).
  const response = await sendExtensionEntryAction(
    extensionId,
    LIST_CATEGORIES,
    { action: LIST_MALL_CATEGORIES_ACTION, mall, path: [...path] },
    CATEGORY_TIMEOUT_MS,
  );
  if (!response.success) throw new Error(response.error);
  return response.categories.map((category) => category.name);
}
