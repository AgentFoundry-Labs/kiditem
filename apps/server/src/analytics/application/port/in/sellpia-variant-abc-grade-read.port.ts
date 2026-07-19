import type { SellpiaProductAbcGrade } from '@kiditem/shared/dashboard';

export const SELLPIA_VARIANT_ABC_GRADE_READ_PORT = Symbol(
  'SELLPIA_VARIANT_ABC_GRADE_READ_PORT',
);

export interface SellpiaVariantAbcGradeReadPort {
  findAbcGradesByProductVariantIds(input: {
    organizationId: string;
    productVariantIds: string[];
  }): Promise<Map<string, SellpiaProductAbcGrade[]>>;
}
