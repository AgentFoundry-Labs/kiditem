export const KIDITEM_STOREFRONT_PORT = Symbol("KiditemStorefrontPort");

export interface KiditemStorefrontProduct {
  externalId: string;
  name: string;
  link: string;
}

export interface KiditemStorefrontPort {
  listNewProducts(): Promise<KiditemStorefrontProduct[]>;
}
