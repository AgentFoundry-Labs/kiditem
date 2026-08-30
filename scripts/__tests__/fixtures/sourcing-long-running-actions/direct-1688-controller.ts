import { Sourcing1688KeywordSearchService } from '../../../apps/server/src/sourcing/application/service/sourcing-1688-keyword-search.service';

export class Direct1688Controller {
  constructor(private readonly keywordSearch: Sourcing1688KeywordSearchService) {}

  search() {
    return this.keywordSearch.searchForOperation({ keyword: '문구' });
  }
}
