import type { SalesProductMallPriceAdoption } from '@kiditem/shared/sales-product';

export const SALES_PRODUCT_MALL_PRICE_PORT = Symbol(
  'SALES_PRODUCT_MALL_PRICE_PORT',
);

export interface SalesProductMallPricePort {
  adopt(
    organizationId: string,
    apply: boolean,
  ): Promise<SalesProductMallPriceAdoption>;
}
