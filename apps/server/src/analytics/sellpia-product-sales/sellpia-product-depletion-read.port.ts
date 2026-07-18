import type { ProductDepletionProjection } from '@kiditem/shared/product-operations';

export interface SellpiaProductDepletionReadPort {
  findByMasterProductIds(input: {
    organizationId: string;
    masterProductIds: string[];
    monthsWindow?: number;
  }): Promise<Map<string, ProductDepletionProjection>>;
}

export const SELLPIA_PRODUCT_DEPLETION_READ_PORT = Symbol(
  'SELLPIA_PRODUCT_DEPLETION_READ_PORT',
);
