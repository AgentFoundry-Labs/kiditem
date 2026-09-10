import {
  detectOrderCollectionExtensionId,
  sendToExtension,
} from '@/lib/extension-bridge';
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

interface CategoryResponse {
  success?: boolean;
  ok?: boolean;
  names?: string[];
  error?: string;
}

export async function listMallCategories(
  mall: MallFormRegisterMall,
  path: readonly string[],
): Promise<string[]> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error('확장프로그램이 필요합니다. 몰 분류는 몰에서 직접 읽어옵니다.');
  }

  const response = await sendToExtension<CategoryResponse>(
    extensionId,
    { action: 'listMallCategories', mall, path: [...path] },
    CATEGORY_TIMEOUT_MS,
  );
  if (!response?.ok && !response?.success) {
    throw new Error(response?.error ?? '분류 목록을 받지 못했습니다.');
  }
  return response.names ?? [];
}
