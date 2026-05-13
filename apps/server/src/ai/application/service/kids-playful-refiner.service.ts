import { Injectable, Optional } from '@nestjs/common';
import type { DetailPageGeneration } from '../../domain/prompts/detail-page/single-call';
import { findSafetyLabelImageUrlIndices, packagePreference, shouldInferPackageImages } from './detail-page-template-rules';
import type {
  DetailPageRawInput,
  DetailPageTemplateId,
  KidsPlayfulImageContext,
} from './detail-page-ai.types';
import { DetailPageHeroImageService } from './detail-page-hero-image.service';

/**
 * Kids-playful template refiner. Two responsibilities:
 *
 *   - `prepareKidsPlayfulImageContext` — runs before the LLM call to
 *     infer package-image positions and surface safety-label markers so
 *     the LLM can avoid them when picking heroes/scenarios.
 *   - `applyKidsPlayfulImageSelectionRules` — runs after the LLM call
 *     to claim image indices in order, blocking package + safety
 *     positions and providing fallbacks for empty hero / gallery slots.
 *
 * `heroImageService` is optional — when absent, package inference is a
 * no-op and only URL-based safety detection runs.
 */
@Injectable()
export class KidsPlayfulRefinerService {
  constructor(
    @Optional()
    private readonly heroImageService?: DetailPageHeroImageService,
  ) {}

  async prepareKidsPlayfulImageContext(input: {
    templateId: DetailPageTemplateId;
    rawInput: Pick<DetailPageRawInput, 'rawDescription' | 'rawOptions' | 'imageUrls'>;
  }): Promise<KidsPlayfulImageContext> {
    if (input.templateId !== 'kids-playful') {
      return {
        packageImageIndices: new Set<number>(),
        safetyLabelImageIndices: new Set<number>(),
      };
    }

    const packageImageIndices = await this.inferKidsPackageImageIndices(input.rawInput);
    return {
      packageImageIndices,
      safetyLabelImageIndices: findSafetyLabelImageUrlIndices(input.rawInput.imageUrls),
    };
  }

  applyKidsPlayfulImageSelectionRules(
    parsed: DetailPageGeneration,
    rawInput: { imageUrls: string[]; usageSectionMode?: 'include' | 'exclude' },
    context?: KidsPlayfulImageContext,
  ): DetailPageGeneration {
    const packageImageIndices = new Set(context?.packageImageIndices ?? []);
    const safetyLabelImageIndices = new Set([
      ...(context?.safetyLabelImageIndices ?? []),
      ...findSafetyLabelImageUrlIndices(rawInput.imageUrls),
    ]);
    const blockedIndices = new Set<number>([
      ...packageImageIndices,
      ...safetyLabelImageIndices,
    ]);
    const usedNormal = new Set<number>();

    const isAvailable = (value: number | null | undefined): value is number => (
      Number.isInteger(value) &&
      value !== null &&
      value !== undefined &&
      value >= 0 &&
      value < rawInput.imageUrls.length &&
      !blockedIndices.has(value)
    );
    const claim = (value: number | null | undefined): number | null => {
      if (!isAvailable(value) || usedNormal.has(value)) return null;
      usedNormal.add(value);
      return value;
    };
    const claimFirstRemaining = (): number | null => {
      for (let index = 0; index < rawInput.imageUrls.length; index += 1) {
        if (!isAvailable(index) || usedNormal.has(index)) continue;
        usedNormal.add(index);
        return index;
      }
      return null;
    };

    const section1HeroImageIndex = claim(parsed.section1.heroImageIndex) ?? claimFirstRemaining();
    const section3Scenarios = parsed.section3.scenarios.map((scenario) => ({
      ...scenario,
      imageIndex: claim(scenario.imageIndex),
    }));
    const section4MoodImageIndex = claim(parsed.section4.moodImageIndex);
    const section5ImageIndex = claim(parsed.section5.imageIndex);
    const section6Cards = parsed.section6.cards.map((card) => ({
      ...card,
      imageIndex: claim(card.imageIndex),
    }));
    const section7ImageIndex = claim(parsed.section7.imageIndex);
    const section8Blocks = parsed.section8.blocks.map((block) => ({
      ...block,
      imageIndex: claim(block.imageIndex),
    }));
    const section10Cards = parsed.section10.cards.map((card) => ({
      ...card,
      imageIndex: claim(card.imageIndex),
    }));

    const galleryFirstCandidate = parsed.section11.galleryImageIndices[0];
    const gallerySecondCandidate = parsed.section11.galleryImageIndices[1];
    const galleryFirst = claim(galleryFirstCandidate) ?? claimFirstRemaining();
    const packageGallery = [...packageImageIndices].find((index) => (
      Number.isInteger(index) &&
      index >= 0 &&
      index < rawInput.imageUrls.length &&
      !safetyLabelImageIndices.has(index)
    ));
    const gallerySecond = packageGallery ?? claim(gallerySecondCandidate) ?? claimFirstRemaining();

    return {
      ...parsed,
      usageEnabled: rawInput.usageSectionMode !== 'exclude',
      section1: {
        ...parsed.section1,
        heroImageIndex: section1HeroImageIndex,
      },
      section3: {
        ...parsed.section3,
        scenarios: section3Scenarios,
      },
      section4: {
        ...parsed.section4,
        moodImageIndex: section4MoodImageIndex,
      },
      section5: {
        ...parsed.section5,
        imageIndex: section5ImageIndex,
      },
      section6: {
        ...parsed.section6,
        cards: section6Cards,
      },
      section7: {
        ...parsed.section7,
        imageIndex: section7ImageIndex,
      },
      section8: {
        ...parsed.section8,
        blocks: section8Blocks,
      },
      section10: {
        ...parsed.section10,
        cards: section10Cards,
      },
      section11: {
        ...parsed.section11,
        galleryImageIndices: [galleryFirst, gallerySecond],
      },
    };
  }

  private async inferKidsPackageImageIndices(rawInput: {
    rawDescription?: string;
    rawOptions?: string;
    imageUrls: string[];
  }): Promise<Set<number>> {
    const result = new Set<number>();
    if (packagePreference(rawInput) === 'none') return result;
    if (!this.heroImageService || rawInput.imageUrls.length === 0) return result;
    if (!shouldInferPackageImages(rawInput)) return result;

    try {
      const indices = await this.heroImageService.inferPackageImagePositions({
        imageUrls: rawInput.imageUrls,
      });
      for (const index of indices) {
        if (!Number.isInteger(index) || index < 0 || index >= rawInput.imageUrls.length) continue;
        result.add(index);
      }
    } catch {
      // Package classification is best-effort; prompt-level hints still help when available.
    }
    return result;
  }
}
