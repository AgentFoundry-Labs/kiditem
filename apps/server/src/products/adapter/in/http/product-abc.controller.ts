import { Controller, Inject, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  MASTER_PRODUCT_ABC_RECALCULATION_PORT,
  type MasterProductAbcRecalculationPort,
} from '../../../application/port/in/master-product-abc-recalculation.port';

@Controller('products/abc')
export class ProductAbcController {
  constructor(
    @Inject(MASTER_PRODUCT_ABC_RECALCULATION_PORT)
    private readonly abc: MasterProductAbcRecalculationPort,
  ) {}

  @Post('recalculate')
  recalculate(@CurrentOrganization() organizationId: string) {
    return this.abc.recalculate({ organizationId });
  }
}
