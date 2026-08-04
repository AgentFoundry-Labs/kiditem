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
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ChannelProductMatchingService } from '../../../application/service/channel-product-matching.service';
import { SellpiaManualMatchService } from '../../../application/service/sellpia-manual-match.service';
import {
  ChannelMatchCandidateQueryDto,
  ChannelProductMatchingQueryDto,
} from './dto/channel-product-matching-query.dto';

@Controller('channels/product-mappings')
export class ChannelProductMatchingController {
  constructor(
    private readonly matching: ChannelProductMatchingService,
    private readonly sellpiaManualMatches: SellpiaManualMatchService,
  ) {}

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ChannelProductMatchingQueryDto,
  ) {
    return this.matching.list(organizationId, query);
  }

  @Post('auto-match')
  autoMatch(
    @CurrentOrganization() organizationId: string,
    @Body() body: unknown,
  ) {
    return this.matching.autoMatch(organizationId, body);
  }

  @Get('sellpia-manual-match/targets')
  sellpiaManualMatchTargets(
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sellpiaManualMatches.targets(organizationId);
  }

  @Post('sellpia-manual-match/import')
  importSellpiaManualMatches(
    @CurrentOrganization() organizationId: string,
    @Body() body: unknown,
  ) {
    return this.sellpiaManualMatches.import(organizationId, body);
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
}
