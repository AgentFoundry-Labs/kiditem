import { Injectable } from '@nestjs/common';
import type { DetailPageGenerationDto } from './detail-page-ai.types';
import { DetailPageGenerationService } from './detail-page-generation.service';

@Injectable()
export class ContentGenerationRerunService {
  constructor(private readonly detailPageGeneration: DetailPageGenerationService) {}

  rerunSameInput(
    generationId: string,
    organizationId: string,
    triggeredByUserId: string | null,
  ): Promise<DetailPageGenerationDto> {
    return this.detailPageGeneration.rerunSameInput(
      generationId,
      organizationId,
      triggeredByUserId,
    );
  }
}
