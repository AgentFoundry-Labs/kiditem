import { ExportWingInventoryWorkbookMessageSchema } from '@kiditem/shared/extension-actions';
import type { z } from 'zod';
import type { ApiPort } from '../../core/api';
import type { EntryAction } from '../../core/dispatch';
import { parseErrorEnvelope, RuntimeError } from '../../core/errors';

/**
 * `exportWingInventoryWorkbook`(내부 메시지, KID-366) — Wing 상품목록 콘텐츠 스크립트가 모은 행을 팝업이 Wing 탭을 묶어 둔
 * 환경의 서버로 보내 xls로 바꿔 받는다. 브라우저는 통합문서를 만들지 않는다. 행은 서버에만 가고 파일만 돌아온다.
 */
export const WING_INVENTORY_EXPORT_PATH = '/api/channels/coupang-wing/inventory-export';

export function exportWingInventoryWorkbookAction(deps: { apiFor(environmentId: string): ApiPort; now(): Date }): EntryAction<z.infer<typeof ExportWingInventoryWorkbookMessageSchema>> {
  return {
    schema: ExportWingInventoryWorkbookMessageSchema,
    async handle(input, { environmentId }) {
      if (input.rows.length === 0) throw new RuntimeError('VALIDATION_FAILED', 'Wing 상품 행이 없습니다.', { fields: ['rows'] });
      const response = await deps.apiFor(environmentId).fetch(WING_INVENTORY_EXPORT_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: input.rows, fileName: defaultFileName(deps.now()) }),
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!response.ok) {
        let body: unknown = null;
        try {
          body = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          body = null;
        }
        const envelope = parseErrorEnvelope(body);
        if (envelope) throw new RuntimeError(envelope.code, envelope.message, envelope.details ?? null);
        throw new RuntimeError('EXTENSION_UNKNOWN_FAILURE', `재고 엑셀을 만들지 못했습니다(HTTP ${response.status}).`, { status: response.status });
      }
      return { success: true, fileName: fileNameOf(response.headers.get('content-disposition')) ?? 'wing-inventory.xls', b64: toBase64(bytes) };
    },
  };
}

function defaultFileName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `wing-inventory_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}.${pad(now.getMinutes())}.xls`;
}

function fileNameOf(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}
