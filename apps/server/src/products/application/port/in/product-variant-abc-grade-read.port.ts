import type { ProductAbcGrade } from '@kiditem/shared/product-abc';

export const PRODUCT_VARIANT_ABC_GRADE_READ_PORT = Symbol(
  'PRODUCT_VARIANT_ABC_GRADE_READ_PORT',
);

export interface ProductVariantAbcGradeReadPort {
  findAbcGradesByProductVariantIds(input: {
    organizationId: string;
    productVariantIds: string[];
  }): Promise<Map<string, ProductAbcGrade[]>>;
}
