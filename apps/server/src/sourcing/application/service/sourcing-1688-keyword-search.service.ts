import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  SOURCING_1688_KEYWORD_SEARCH_PORT,
  type Search1688KeywordInput,
  type Search1688KeywordResult,
  type Search1688KeywordStatus,
  type Sourcing1688KeywordSearchPort,
} from '../port/out/provider/1688-keyword-search.port';

@Injectable()
export class Sourcing1688KeywordSearchService {
  constructor(
    @Inject(SOURCING_1688_KEYWORD_SEARCH_PORT)
    private readonly keywordSearch: Sourcing1688KeywordSearchPort,
  ) {}

  getStatus(): Search1688KeywordStatus {
    return this.keywordSearch.getStatus();
  }

  searchByKeyword(input: Search1688KeywordInput): Promise<Search1688KeywordResult> {
    const keyword = input.keyword.trim();
    if (!keyword) {
      throw new BadRequestException('1688 keyword search requires a keyword');
    }

    return this.keywordSearch.searchByKeyword({
      keyword,
      page: input.page,
      maxResults: input.maxResults,
    });
  }
}
