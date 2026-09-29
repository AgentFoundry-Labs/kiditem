import { FetchCoupangShipmentPdfBatchMessageSchema } from '@kiditem/shared/extension-actions';
import type { z } from 'zod';
import type { EntryAction } from '../../core/dispatch';
import { createCoupangSupplierSite } from '../../sites/coupang-supplier';
import type { SiteDeps } from '../../sites/registry';

/**
 * `fetchCoupangShipmentPdfBatch` — 공급사 탭 하나(확인용, 끝나면 닫는다)에서 Label·내역서 PDF를 차례로 받아 base64로
 * 돌려준다. 웹이 합친다 — 서버 사실이 아니다. 쿠키 과다는 `SITE_COOKIE_BLOAT`, 로그인 화면은 `SITE_LOGIN_REQUIRED`로 멈추고
 * 로그인 화면이면 탭을 운영자에게 남긴다.
 */
export function fetchCoupangShipmentPdfBatchAction(deps: Pick<SiteDeps, 'tabs' | 'now' | 'sleep'>): EntryAction<z.infer<typeof FetchCoupangShipmentPdfBatchMessageSchema>> {
  return {
    schema: FetchCoupangShipmentPdfBatchMessageSchema,
    async handle(input) {
      const site = createCoupangSupplierSite(deps);
      try {
        const files = [];
        for (const item of input.items) files.push(await site.shipmentPdf(item.seq, item.kind));
        return { success: true, files };
      } finally {
        await site.close();
      }
    },
  };
}
