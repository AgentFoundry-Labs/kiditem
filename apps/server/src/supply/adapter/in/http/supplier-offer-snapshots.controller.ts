import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import {
  SUPPLY_SOURCING_PROCUREMENT_PORT,
  type SupplySourcingProcurementPort,
} from '../../../application/port/in/procurement/supply-sourcing-procurement.port';
import {
  CreateSupplierOfferSnapshotDto,
  ListSupplierOfferSnapshotsQueryDto,
} from './dto';

@Controller('supplier-offer-snapshots')
@Roles('owner', 'admin')
export class SupplierOfferSnapshotsController {
  constructor(
    @Inject(SUPPLY_SOURCING_PROCUREMENT_PORT)
    private readonly procurement: SupplySourcingProcurementPort,
  ) {}

  @Post()
  create(
    @CurrentOrganization() organizationId: string,
    @Body() dto: CreateSupplierOfferSnapshotDto,
  ) {
    return this.procurement.createOfferSnapshot({ organizationId, ...dto });
  }

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListSupplierOfferSnapshotsQueryDto,
  ) {
    return this.procurement.listOfferSnapshots({ organizationId, ...query });
  }

  @Get(':id')
  async get(
    @CurrentOrganization() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const snapshot = await this.procurement.findOfferSnapshot({
      organizationId,
      id,
    });
    if (!snapshot) {
      throw new NotFoundException(
        'Supplier offer snapshot was not found in the active organization.',
      );
    }
    return snapshot;
  }
}
