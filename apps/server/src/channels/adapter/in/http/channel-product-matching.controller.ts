import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ChannelProductMatchingService } from '../../../application/service/channel-product-matching.service';
import {
  ChannelMatchCandidateQueryDto,
  ChannelProductMatchingQueryDto,
} from './dto/channel-product-matching-query.dto';

@Controller('channels/product-mappings')
export class ChannelProductMatchingController {
  constructor(private readonly matching: ChannelProductMatchingService) {}

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ChannelProductMatchingQueryDto,
  ) {
    return this.matching.list(organizationId, query);
  }

  @Get(':channelListingId/candidates')
  productCandidates(
    @Param('channelListingId', new ParseUUIDPipe()) channelListingId: string,
    @CurrentOrganization() organizationId: string,
    @Query() query: ChannelMatchCandidateQueryDto,
  ) {
    return this.matching.productCandidates(organizationId, channelListingId, query);
  }

  @Put(':channelListingId/master-product')
  linkProduct(
    @Param('channelListingId', new ParseUUIDPipe()) channelListingId: string,
    @CurrentOrganization() organizationId: string,
    @Body() body: unknown,
  ) {
    return this.matching.linkProduct(organizationId, channelListingId, body);
  }

  @Get('options/:channelListingOptionId/candidates')
  variantCandidates(
    @Param('channelListingOptionId', new ParseUUIDPipe()) channelListingOptionId: string,
    @CurrentOrganization() organizationId: string,
    @Query() query: ChannelMatchCandidateQueryDto,
  ) {
    return this.matching.variantCandidates(
      organizationId,
      channelListingOptionId,
      query,
    );
  }

  @Put('options/:channelListingOptionId/product-variant')
  linkOption(
    @Param('channelListingOptionId', new ParseUUIDPipe()) channelListingOptionId: string,
    @CurrentOrganization() organizationId: string,
    @Body() body: unknown,
  ) {
    return this.matching.linkOption(organizationId, channelListingOptionId, body);
  }
}
