export const SELLPIA_PRODUCT_SALES_EVENTS = {
  INGESTED: 'analytics.sellpia-product-sales.ingested.v1',
} as const;

export type SellpiaProductSalesIngestedEvent = Readonly<{
  organizationId: string;
}>;
