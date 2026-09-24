import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { KiditemNotFoundError } from '@kiditem/shared/errors';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  SUPPLY_SOURCING_PROCUREMENT_PORT,
  type SupplySourcingProcurementPort,
} from '../../../application/port/in/procurement/supply-sourcing-procurement.port';
import { ListProcurementTestIntentsQueryDto } from './dto';

@Controller('procurement-test-intents')
export class ProcurementTestIntentsController {
  constructor(
    @Inject(SUPPLY_SOURCING_PROCUREMENT_PORT)
    private readonly procurement: SupplySourcingProcurementPort,
  ) {}

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListProcurementTestIntentsQueryDto,
  ) {
    return this.procurement.listTestIntents({ organizationId, ...query });
  }

  @Get(':id')
  async get(
    @CurrentOrganization() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const intent = await this.procurement.getTestIntent({ organizationId, id });
    if (!intent) {
      throw new KiditemNotFoundError('NOT_FOUND', { details: { reason: 'procurement_test_intent' } });
    }
    return intent;
  }
}
