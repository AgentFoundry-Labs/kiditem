import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  OrderCollectionMallAccountService,
  type OrderCollectionMallAccount,
  type OrderCollectionMallPassword,
  type UpdateOrderCollectionMallAccountInput,
} from '../services/order-collection-mall-account.service';

@Controller('orders/collection/malls')
export class OrderCollectionMallAccountController {
  constructor(private readonly accounts: OrderCollectionMallAccountService) {}

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
  ): Promise<OrderCollectionMallAccount[]> {
    return this.accounts.list(organizationId);
  }

  @Get(':mallKey/password')
  @Roles('owner', 'admin')
  password(
    @CurrentOrganization() organizationId: string,
    @Param('mallKey') mallKey: string,
  ): Promise<OrderCollectionMallPassword> {
    return this.accounts.getPassword(organizationId, mallKey);
  }

  /** ':mallKey' 보다 먼저 선언해야 'display-order' 가 몰 키로 잡히지 않는다. */
  @Patch('display-order')
  @Roles('owner', 'admin')
  reorder(
    @CurrentOrganization() organizationId: string,
    @Body() body: { mallKeys?: unknown },
  ): Promise<OrderCollectionMallAccount[]> {
    return this.accounts.reorder(organizationId, body?.mallKeys);
  }

  @Patch(':mallKey')
  @Roles('owner', 'admin')
  update(
    @CurrentOrganization() organizationId: string,
    @Param('mallKey') mallKey: string,
    @Body() body: UpdateOrderCollectionMallAccountInput,
  ): Promise<OrderCollectionMallAccount> {
    return this.accounts.update(organizationId, mallKey, body);
  }
}
