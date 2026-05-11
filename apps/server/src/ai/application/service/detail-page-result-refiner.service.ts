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
 * services per template:
 *
 *   - `BoldVerticalRefinerService` — owns the bold-vertical pipeline plus
 *     `suppressProductInfoWhenSafetyLabelExists` (used by
 *     `DetailPageQueryService` on stored bold-vertical results).
 *   - `KidsPlayfulRefinerService` — owns kids-playful pre-LLM context
 *     preparation and post-LLM image selection rules.
 *
 * Callers (`DetailPageGenerationService`, the agent runtime handler, and
 * `DetailPageQueryService`) bind to this facade so the public surface is
 * unchanged across the split.
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
  }): Promise<KidsPlayfulImageContext> {
    return this.kidsPlayful.prepareKidsPlayfulImageContext(input);
  }

  applyKidsPlayfulImageSelectionRules(
    parsed: DetailPageGeneration,
    rawInput: { imageUrls: string[] },
    context?: KidsPlayfulImageContext,
  ): DetailPageGeneration {
    return this.kidsPlayful.applyKidsPlayfulImageSelectionRules(parsed, rawInput, context);
  }

  refineBoldVerticalGeneration(
    parsed: BoldVerticalGeneration,
    rawInput: DetailPageRawInput,
  ): Promise<BoldVerticalGeneration> {
    return this.boldVertical.refineBoldVerticalGeneration(parsed, rawInput);
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
