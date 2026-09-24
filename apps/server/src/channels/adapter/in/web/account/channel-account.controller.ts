import { BadRequestException, Body, Inject, Controller, Get, Patch } from '@nestjs/common';
import {
  UpdateCoupangAccountSettingsSchema,
  type CoupangAccountSettings,
} from '@kiditem/shared/channel-account';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { Roles } from '../../../../../auth/decorators/roles.decorator';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort, type MallAccount, type MallAccountPassword, type UpdateMallAccountInput } from '../../../../application/port/in/account/channel-account.port';
import { UpdateCoupangAccountSettingsDto } from '../dto/index';

@Controller('channels/coupang/account')
export class ChannelAccountController {
  constructor(@Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort) {}

  @Get()
  getCoupangSettings(
    @CurrentOrganization() organizationId: string,
  ): Promise<CoupangAccountSettings> {
    return this.channelAccounts.getCoupangSettings(organizationId);
  }

  @Patch()
  @Roles('owner', 'admin')
  updateCoupangSettings(
    @CurrentOrganization() organizationId: string,
    @Body() body: UpdateCoupangAccountSettingsDto,
  ): Promise<CoupangAccountSettings> {
    const parsed = UpdateCoupangAccountSettingsSchema.safeParse({
      vendorId: body.vendorId,
    });
    if (!parsed.success) {
      throw new BadRequestException('쿠팡 계정 설정 입력값을 확인하세요.');
    }
    return this.channelAccounts.upsertCoupangSettings(organizationId, parsed.data);
  }
}
