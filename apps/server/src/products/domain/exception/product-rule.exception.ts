export class ProductRuleException extends Error {
  constructor(readonly code: 'INVALID_SOURCE_IDENTITY' | 'INVALID_PRODUCT_CODE' | 'INVALID_STOCK' | 'INVALID_PURCHASE_PRICE', message: string) {
    super(message);
    this.name = 'ProductRuleException';
  }
}
