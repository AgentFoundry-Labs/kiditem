import type { ListProductCatalogQuery } from '../../../dto/list-product-catalog.query';

export const PRODUCT_CATALOG_REPOSITORY_PORT = Symbol('PRODUCT_CATALOG_REPOSITORY_PORT');

export type CatalogOptionRow = {
  id: string;
  masterId: string;
  organizationId: string;
  sku: string;
  barcode: string | null;
  legacyCode: string | null;
  optionName: string | null;
  sortOrder: number;
  costPrice: number | null;
  sellPrice: number | null;
  commissionRate: { toNumber(): number } | number | null;
  shippingCost: number | null;
  otherCost: number | null;
  isBundle: boolean;
  availableStock: number | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  isTemporary: boolean;
  temporaryReason: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  inventory?: { currentStock: number } | null;
};

export type CatalogMasterRow = {
  id: string;
  organizationId: string;
  code: string;
  legacyCode: string | null;
  barcode: string | null;
  name: string;
  description: string;
  category: string | null;
  brand: string | null;
  tags: unknown;
  optionCounter: number;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  images: unknown;
  abcGrade: string | null;
  profitTag: string | null;
  adTier: string | null;
  adBudgetLimit: number | null;
  healthScore: number | null;
  healthUpdatedAt: Date | null;
  lifecycleState: string;
  detailPageUrl: string | null;
  thumbnailStrategy: string;
  isDeleted: boolean;
  deletedAt: Date | null;
  isTemporary: boolean;
  temporaryReason: string | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
  options: CatalogOptionRow[];
};

export type CatalogCountsRow = {
  abcGrade: string | null;
  adTier: string | null;
  lifecycleState: string;
  isTemporary: boolean;
};

export interface ProductCatalogRepositoryPort {
  findCatalogPage(
    organizationId: string,
    query: ListProductCatalogQuery,
  ): Promise<{ rows: CatalogMasterRow[]; total: number; page: number; limit: number }>;
  findCatalogDetail(organizationId: string, id: string): Promise<CatalogMasterRow | null>;
  findCatalogCountsRows(
    organizationId: string,
    query?: Pick<ListProductCatalogQuery, 'lifecycleState'>,
  ): Promise<CatalogCountsRow[]>;
}
