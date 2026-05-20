import { Injectable } from '@nestjs/common';
import type { BoldVerticalGeneration } from '../../domain/prompts/bold-vertical/single-call';
import type { DetailPageGeneration } from '../../domain/prompts/detail-page/single-call';
import type {
  DetailPageRawInput,
  DetailPageTemplateId,
  KidsPlayfulImageContext,
} from './detail-page-ai.types';
import { BoldVerticalRefinerService } from './bold-vertical-refiner.service';
import { KidsPlayfulRefinerService } from './kids-playful-refiner.service';

/**
 * Public facade for detail-page result refinement. Composes two specialized
 * services per template while keeping the caller-facing API stable.
 */
@Injectable()
export class DetailPageResultRefinerService {
  constructor(
    private readonly boldVertical: BoldVerticalRefinerService,
    private readonly kidsPlayful: KidsPlayfulRefinerService,
  ) {}

  prepareKidsPlayfulImageContext(input: {
    templateId: DetailPageTemplateId;
    rawInput: Pick<DetailPageRawInput, 'rawDescription' | 'rawOptions' | 'imageUrls'>;
    visionModel?: string;
  }): Promise<KidsPlayfulImageContext> {
    return this.kidsPlayful.prepareKidsPlayfulImageContext(input);
  }

  applyKidsPlayfulImageSelectionRules(
    parsed: DetailPageGeneration,
    rawInput: { imageUrls: string[]; usageSectionMode?: 'include' | 'exclude' },
    context?: KidsPlayfulImageContext,
  ): DetailPageGeneration {
    return this.kidsPlayful.applyKidsPlayfulImageSelectionRules(parsed, rawInput, context);
  }

  refineBoldVerticalGeneration(
    parsed: BoldVerticalGeneration,
    rawInput: DetailPageRawInput,
    options: { visionModel?: string } = {},
  ): Promise<BoldVerticalGeneration> {
    return this.boldVertical.refineBoldVerticalGeneration(parsed, rawInput, options);
  }

  suppressProductInfoWhenSafetyLabelExists<T>(
    result: T,
    templateId: DetailPageTemplateId,
    imageUrls: string[],
    detectedSafetyLabelIndices?: Set<number>,
  ): T {
    return this.boldVertical.suppressProductInfoWhenSafetyLabelExists(
      result,
      templateId,
      imageUrls,
      detectedSafetyLabelIndices,
    );
  }
}
