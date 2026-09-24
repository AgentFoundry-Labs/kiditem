import { Body, Inject, Controller, Get, Param, Patch } from '@nestjs/common';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { Roles } from '../../../../../auth/decorators/roles.decorator';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort, type MallAccount, type MallAccountPassword, type UpdateMallAccountInput } from '../../../../application/port/in/account/channel-account.port';

@Controller('orders/collection/malls')
export class OrderCollectionMallAccountController {
  constructor(@Inject(CHANNEL_ACCOUNT_PORT) private readonly accounts: ChannelAccountPort) {}

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
  ): Promise<MallAccount[]> {
    return this.accounts.list(organizationId);
  }

  @Get(':mallKey/password')
  @Roles('owner', 'admin')
  password(
    @CurrentOrganization() organizationId: string,
    @Param('mallKey') mallKey: string,
  ): Promise<MallAccountPassword> {
    return this.accounts.getPassword(organizationId, mallKey);
  }

  /** ':mallKey' 보다 먼저 선언해야 'display-order' 가 몰 키로 잡히지 않는다. */
  @Patch('display-order')
  @Roles('owner', 'admin')
  reorder(
    @CurrentOrganization() organizationId: string,
    @Body() body: { mallKeys?: unknown },
  ): Promise<MallAccount[]> {
    return this.accounts.reorder(organizationId, body?.mallKeys);
  }

  /** 등록 기본값 문서만 고친다(KID-235). 계정 로그인은 `PATCH :mallKey` 가 따로 받는다. */
  @Patch(':mallKey/listing-profile')
  @Roles('owner', 'admin')
  updateListingProfile(
    @CurrentOrganization() organizationId: string,
    @Param('mallKey') mallKey: string,
    @Body() body: unknown,
  ): Promise<MallAccount> {
    return this.accounts.updateListingProfile(organizationId, mallKey, body);
  }

  @Patch(':mallKey')
  @Roles('owner', 'admin')
  update(
    @CurrentOrganization() organizationId: string,
    @Param('mallKey') mallKey: string,
    @Body() body: UpdateMallAccountInput,
  ): Promise<MallAccount> {
    return this.accounts.update(organizationId, mallKey, body);
  }
}
