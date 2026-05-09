import { BadRequestException, Body, Controller, Get, Patch } from '@nestjs/common';
import {
  UpdateCoupangAccountSettingsSchema,
  type CoupangAccountSettings,
} from '@kiditem/shared/channel-account';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { ChannelAccountService } from '../../../application/service/channel-account.service';
import { UpdateCoupangAccountSettingsDto } from './dto';

@Controller('channels/coupang/account')
export class ChannelAccountController {
  constructor(private readonly channelAccounts: ChannelAccountService) {}

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
      accessKey: body.accessKey?.trim() ? body.accessKey : undefined,
      secretKey: body.secretKey?.trim() ? body.secretKey : undefined,
    });
    if (!parsed.success) {
      throw new BadRequestException('쿠팡 계정 설정 입력값을 확인하세요.');
    }
    return this.channelAccounts.upsertCoupangSettings(organizationId, parsed.data);
  }
}
