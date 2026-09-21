import { ProductRuleException } from './exception/product-rule.exception';

export type ProductSourceIdentity = Readonly<{
  sourceAccountKey: string;
  sourceProductCode: string;
  sourceOptionCode: string;
}>;

export type ProductSourceFacts = Readonly<{
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
  purchasePrice: number | null;
}>;

/** Source inventory product, independent of storage and presentation. */
export type MasterProduct = ProductSourceIdentity & ProductSourceFacts & Readonly<{
  id: string;
  organizationId: string;
  code: string;
  imageUrls: readonly string[];
  createdAt: Date;
  updatedAt: Date;
}>;

export function applySourceFacts(
  product: MasterProduct,
  facts: ProductSourceFacts,
  changedAt: Date,
): MasterProduct {
  if (!Number.isInteger(facts.currentStock) || facts.currentStock < 0 || facts.currentStock > 2_147_483_647) {
    throw new ProductRuleException('INVALID_STOCK', 'Source stock must be a bounded nonnegative integer.');
  }
  if (facts.purchasePrice !== null && (
    !Number.isInteger(facts.purchasePrice) || facts.purchasePrice < 0 || facts.purchasePrice > 2_147_483_647
  )) {
    throw new ProductRuleException('INVALID_PURCHASE_PRICE', 'Purchase price must be unknown or a bounded nonnegative KRW amount.');
  }
  return {
    ...product,
    name: facts.name,
    optionName: facts.optionName,
    barcode: facts.barcode,
    currentStock: facts.currentStock,
    purchasePrice: facts.purchasePrice,
    updatedAt: changedAt,
  };
}
