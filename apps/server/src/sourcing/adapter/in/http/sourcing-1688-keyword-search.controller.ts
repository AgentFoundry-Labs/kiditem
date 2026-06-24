import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { Sourcing1688KeywordSearchService } from '../../../application/service/sourcing-1688-keyword-search.service';
import { Search1688KeywordDto } from './dto';

@Controller('sourcing/1688/keyword-search')
export class Sourcing1688KeywordSearchController {
  constructor(private readonly keywordSearch: Sourcing1688KeywordSearchService) {}

  @Get('status')
  status(@CurrentOrganization() _organizationId: string) {
    return this.keywordSearch.getStatus();
  }

  @Post()
  searchByKeyword(
    @Body() body: Search1688KeywordDto,
    @CurrentOrganization() _organizationId: string,
  ) {
    return this.keywordSearch.searchByKeyword(body);
  }
}
