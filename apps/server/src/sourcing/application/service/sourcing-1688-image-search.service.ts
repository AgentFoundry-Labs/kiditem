import { Inject, Injectable } from '@nestjs/common';
import {
  SOURCING_1688_IMAGE_SEARCH_PORT,
  type Search1688ImageInput,
  type Search1688ImageResult,
  type Search1688ImageStatus,
  type Sourcing1688ImageSearchPort,
} from '../port/out/provider/1688-image-search.port';

@Injectable()
export class Sourcing1688ImageSearchService {
  constructor(
    @Inject(SOURCING_1688_IMAGE_SEARCH_PORT)
    private readonly imageSearch: Sourcing1688ImageSearchPort,
  ) {}

  getStatus(): Search1688ImageStatus {
    return this.imageSearch.getStatus();
  }

  searchByImage(input: Search1688ImageInput): Promise<Search1688ImageResult> {
    return this.imageSearch.searchByImage({
      imageUrl: input.imageUrl.trim(),
      keyword: input.keyword?.trim() || undefined,
      maxResults: input.maxResults,
    });
  }
}
