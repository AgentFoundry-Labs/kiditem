import type { SalesProductLinkResult } from '@kiditem/shared/sales-product';
import type { SendRecordLink } from '../../../../domain/sales-product/sales-product-links';

export const SALES_PRODUCT_LINK_PORT = Symbol('SALES_PRODUCT_LINK_PORT');

export interface SalesProductLinkPort {
  preview(
    organizationId: string,
    sendRecords?: readonly SendRecordLink[],
  ): Promise<SalesProductLinkResult>;
  autoLink(
    organizationId: string,
    sendRecords?: readonly SendRecordLink[],
  ): Promise<SalesProductLinkResult>;
}
