import { ProductRuleException } from './exception/product-rule.exception';
import type { ProductSourceIdentity } from './master-product';

export type ProductSourceChange = Readonly<Pick<ProductSourceIdentity, 'sourceProductCode' | 'sourceOptionCode'>>;

export function validateProductSourceChange(change: ProductSourceChange): ProductSourceChange {
  if (!change.sourceProductCode.trim() || change.sourceProductCode !== change.sourceProductCode.trim()
    || change.sourceOptionCode !== change.sourceOptionCode.trim()) {
    throw new ProductRuleException('INVALID_SOURCE_IDENTITY', 'Source codes must be normalized and the product code must be present.');
  }
  return change;
}
