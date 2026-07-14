import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { ChannelSkuMappingService } from '../../../application/service/channel-sku-mapping.service';
import {
  ChannelSkuCandidateQueryDto,
  ChannelSkuMappingQueryDto,
} from './dto/channel-sku-mapping-query.dto';
import {
  parseRefreshChannelSkuMappingStatusDto,
  parseReplaceChannelSkuComponentsDto,
} from './dto/replace-channel-sku-components.dto';

@Controller('channels/sku-mappings')
export class ChannelSkuMappingController {
  constructor(private readonly mappings: ChannelSkuMappingService) {}

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ChannelSkuMappingQueryDto,
  ) {
    return this.mappings.list(organizationId, query);
  }

  @Post('status-refresh')
  async refreshStatuses(
    @CurrentOrganization() organizationId: string,
    @Body() body: unknown,
  ) {
    const input = parseRefreshChannelSkuMappingStatusDto(body);
    return this.mappings.refreshStatuses(organizationId, input);
  }

  @Get(':channelSkuId/candidates')
  candidates(
    @Param('channelSkuId', new ParseUUIDPipe()) channelSkuId: string,
    @CurrentOrganization() organizationId: string,
    @Query() query: ChannelSkuCandidateQueryDto,
  ) {
    return this.mappings.candidates(organizationId, channelSkuId, query);
  }

  @Put(':channelSkuId/components')
  async replaceComponents(
    @Param('channelSkuId', new ParseUUIDPipe()) channelSkuId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const input = parseReplaceChannelSkuComponentsDto(body);
    return this.mappings.replaceComponents(
      organizationId,
      user.id,
      channelSkuId,
      input,
    );
  }
}
