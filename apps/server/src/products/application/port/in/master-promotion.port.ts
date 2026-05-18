import type { ProductsRepositoryTransaction } from '../out/products-transaction.port';

export const PRODUCT_MASTER_PROMOTION_PORT = Symbol('ProductMasterPromotionPort');

export interface ProductMasterPromotionImageInput {
  url: string;
  storageKey: string | null;
  sortOrder: number;
  isPrimary: boolean;
  source: string;
  role: string;
  label: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
}

export interface ProductMasterPromotionOptionInput {
  optionName: string;
  legacyCode?: string;
  barcode?: string;
  sellPrice?: number;
  costPrice?: number;
  sortOrder?: number;
}

export interface ProductMasterPromotionInput {
  candidateSnapshot: {
    name: string;
    description: string;
    category: string | null;
    brand: string | null;
    tags: string[];
    thumbnailUrl: string | null;
    imageUrl: string | null;
    sourceImages: ProductMasterPromotionImageInput[];
  };
  options: ProductMasterPromotionOptionInput[];
}

export interface ProductMasterPromotionResult {
  masterId: string;
  masterCode: string;
}

export interface ProductMasterPromotionPort {
  create(
    outerTx: ProductsRepositoryTransaction | undefined,
    organizationId: string,
    input: ProductMasterPromotionInput,
  ): Promise<ProductMasterPromotionResult>;
}
