import { OpenCoupangShipmentPageMessageSchema } from '@kiditem/shared/extension-actions';
import type { z } from 'zod';
import type { EntryAction } from '../../core/dispatch';
import { openShipmentPage } from '../../sites/coupang-supplier/shipment-files';
import type { TabPages } from '../../sites/tab-page';

/** `openCoupangShipmentPage` — 공급사 쉽먼트 화면을 찾거나 열어 앞으로 가져온다(운영자에게 넘기는 탭). */
export function openCoupangShipmentPageAction(tabs: TabPages): EntryAction<z.infer<typeof OpenCoupangShipmentPageMessageSchema>> {
  return {
    schema: OpenCoupangShipmentPageMessageSchema,
    async handle(input) {
      return { success: true, ...(await openShipmentPage(tabs, input.url)) };
    },
  };
}
