import type {
  SalesProductExternalImages,
  SalesProductImageMirrorResult,
} from '@kiditem/shared/sales-product';

export const SALES_PRODUCT_IMAGE_PORT = Symbol('SALES_PRODUCT_IMAGE_PORT');

export interface SalesProductImagePort {
  external(organizationId: string): Promise<SalesProductExternalImages>;
  mirror(
    organizationId: string,
    options?: {
      limit?: number;
      skip?: number;
    },
  ): Promise<SalesProductImageMirrorResult>;
}
