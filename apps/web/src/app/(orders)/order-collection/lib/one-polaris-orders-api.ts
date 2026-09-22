import { apiClient } from '@/lib/api-client';
import { conversionResultFrom } from './order-collection-conversion-response';
import type { OrderCollectionConversionResult } from './order-collection-api';
import type { OrderCollectionExtensionRun } from './order-collection-extension';

/**
 * 원폴라리스(한솔교육 폐쇄몰)는 판매자 화면이 없다. 주문은 메일 첨부 엑셀로만 오고, 운영자가
 * 그 파일을 올리면 서버가 사장님 양식(주소록 · 단가)으로 칸을 채워 셀피아 `양식` .xls 를 만든다.
 */
export const ONE_POLARIS_MALL_KEY = 'one-polaris';

/** 서버에 저장된 양식 표의 요약. 표 자체(주소록 124곳 · 단가 800여 개)는 화면에 오지 않는다. */
export interface OnePolarisSellpiaTemplateSummary {
  fileName: string;
  uploadedAt: string;
  addressCount: number;
  priceCount: number;
}

const TEMPLATE_PATH = '/api/orders/collection/malls/one-polaris/sellpia-template';

export async function readOnePolarisSellpiaTemplate(): Promise<OnePolarisSellpiaTemplateSummary | null> {
  const result = await apiClient.get<{ template: OnePolarisSellpiaTemplateSummary | null }>(TEMPLATE_PATH);
  return result.template;
}

/** 양식 xls(주소록 · 단가 시트)를 올려 저장한다. 다음 변환부터 이 표를 쓴다. */
export async function saveOnePolarisSellpiaTemplate(
  file: File,
): Promise<OnePolarisSellpiaTemplateSummary> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.fetchRaw(TEMPLATE_PATH, { method: 'PUT', body: formData });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, '원폴라리스 양식 저장에 실패했습니다.'));
  }
  const result = (await response.json()) as { template: OnePolarisSellpiaTemplateSummary };
  return result.template;
}

/**
 * 메일로 받은 주문 엑셀 → 셀피아 `양식` .xls. `template` 을 함께 주면 그 양식을 먼저 저장하고 쓴다.
 * 표에 없어 비워 둔 칸은 결과의 `notes` 에 온다.
 */
export async function convertOnePolarisOrderFile(
  file: File,
  options?: {
    template?: File | null;
    download?: boolean;
    run?: OrderCollectionExtensionRun;
  },
): Promise<OrderCollectionConversionResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.template) formData.append('template', options.template);

  const response = await apiClient.fetchRaw('/api/orders/collection/one-polaris/convert', {
    method: 'POST',
    body: formData,
    headers: options?.run ? {
      'x-order-collection-attempt-id': options.run.attemptId,
      'x-source-attempt-token': options.run.attemptToken,
    } : undefined,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, '원폴라리스 변환에 실패했습니다.'));
  }
  return conversionResultFrom(response, {
    defaultFileName: '원폴라리스_셀피아변환.xls',
    preview: { xlsxColumns: 23 },
    download: options?.download,
  });
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as { message?: unknown; error?: unknown };
    const message = Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error;
  } catch {
    // 본문이 JSON 이 아니면 글자 그대로가 곧 메시지다.
  }
  return text;
}
