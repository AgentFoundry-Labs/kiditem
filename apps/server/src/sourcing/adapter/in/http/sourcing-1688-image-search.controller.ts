import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { Sourcing1688ImageSearchService } from '../../../application/service/sourcing-1688-image-search.service';
import { Search1688ImageDto } from './dto';

@Controller('sourcing/1688/image-search')
export class Sourcing1688ImageSearchController {
  constructor(private readonly imageSearch: Sourcing1688ImageSearchService) {}

  @Get('status')
  status(@CurrentOrganization() _organizationId: string) {
    return this.imageSearch.getStatus();
  }

  @Post()
  searchByImage(
    @Body() body: Search1688ImageDto,
    @CurrentOrganization() _organizationId: string,
  ) {
    return this.imageSearch.searchByImage(body);
  }
}
