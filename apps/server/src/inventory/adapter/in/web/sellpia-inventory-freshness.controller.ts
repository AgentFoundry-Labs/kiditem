import {
  Controller,
  Get,
  Inject,
  Body,
  Post,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import {
  SELLPIA_INVENTORY_COLLECTION_STATUS_PORT,
  type SellpiaInventoryCollectionStatusPort,
} from '../../../application/port/in/stock/sellpia-inventory-freshness.port';
import {
  SellpiaInventorySourceBindingRequestDto,
} from './dto';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('inventory/sellpia-collection-status')
export class SellpiaInventoryFreshnessController {
  constructor(
    @Inject(SELLPIA_INVENTORY_COLLECTION_STATUS_PORT)
    private readonly collectionStatus: SellpiaInventoryCollectionStatusPort,
  ) {}

  @Get()
  getState(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.collectionStatus.getState({ organizationId, userId: user.id });
  }

  @Post('source-binding')
  @Roles('owner', 'admin')
  confirmSourceBinding(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SellpiaInventorySourceBindingRequestDto,
  ) {
    return this.collectionStatus.confirmSourceBinding({
      organizationId,
      userId: user.id,
      sourceOrigin: dto.sourceOrigin,
      sourceAccountKey: dto.sourceAccountKey,
      confirmed: dto.confirmed,
    });
  }

}
