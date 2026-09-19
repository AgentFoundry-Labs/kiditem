import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SalesProductLinkResult } from '@kiditem/shared/sales-product';
import {
  PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_PORT,
  type ProductChannelOptionRecipeMutationPort,
} from '../port/in/product-channel-option-recipe-mutation.port';
import {
  planSalesProductListingLinks,
  type SalesProductLinkPlan,
  type SendRecordLink,
} from '../../domain/sales-product-links';
import {
  SALES_PRODUCT_REPOSITORY_PORT,
  type SalesProductRepositoryPort,
} from '../port/out/repository/sales-product.repository.port';

const RECIPE_CHUNK = 200;

/**
 * 몰에 올라간 상품 ↔ 판매상품 잇기(ADR-0014). 잇는 칸은 이 서비스만 쓰고, 비어 있는 몰 옵션 레시피는 레시피
 * owner(ADR-0007)의 "있는 레시피는 지키는" 길로만 채운다.
 */
@Injectable()
export class SalesProductLinkService {
  private readonly logger = new Logger(SalesProductLinkService.name);

  constructor(
    @Inject(SALES_PRODUCT_REPOSITORY_PORT)
    private readonly repository: SalesProductRepositoryPort,
    @Inject(PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_PORT)
    private readonly recipes: ProductChannelOptionRecipeMutationPort,
  ) {}

  /** 쓰지 않고 무엇을 이을지만 센다. */
  async preview(organizationId: string, sendRecords: readonly SendRecordLink[] = []): Promise<SalesProductLinkResult> {
    const plan = await this.plan(organizationId, sendRecords);
    return { ...plan.summary, recipesFilled: plan.recipeFills.length };
  }

  async autoLink(organizationId: string, sendRecords: readonly SendRecordLink[] = []): Promise<SalesProductLinkResult> {
    const plan = await this.plan(organizationId, sendRecords);
    const written = await this.repository.applyLinks(organizationId, plan);
    const recipesFilled = await this.fillRecipes(organizationId, plan.recipeFills);
    const result: SalesProductLinkResult = {
      ...plan.summary,
      linkedListings: written.listings,
      linkedOptions: written.options,
      recipesFilled,
    };
    this.logger.log(
      `판매상품 잇기 org=${organizationId} 몰 상품 ${result.linkedListings} · 옵션 ${result.linkedOptions} · 레시피 ${recipesFilled} · 충돌 ${result.conflicts}`,
    );
    return result;
  }

  private async plan(organizationId: string, sendRecords: readonly SendRecordLink[]): Promise<SalesProductLinkPlan> {
    const candidates = await this.repository.readLinkCandidates(organizationId);
    return planSalesProductListingLinks({ ...candidates, sendRecords });
  }

  /** 레시피 owner 가 한 묶음을 거절하면(예: 그사이 쓰지 않게 된 셀피아 상품) 그 묶음만 하나씩 다시 채운다. */
  private async fillRecipes(
    organizationId: string,
    fills: SalesProductLinkPlan['recipeFills'],
  ): Promise<number> {
    let changed = 0;
    for (let start = 0; start < fills.length; start += RECIPE_CHUNK) {
      const chunk = fills.slice(start, start + RECIPE_CHUNK);
      try {
        const result = await this.recipes.applyPreservingRecipes({ organizationId, mutations: chunk });
        changed += result.changedOptionCount;
      } catch (error) {
        this.logger.warn(`레시피 채우기 묶음 실패 — 하나씩 다시 채운다: ${(error as Error).message}`);
        for (const fill of chunk) {
          try {
            const result = await this.recipes.applyPreservingRecipes({ organizationId, mutations: [fill] });
            changed += result.changedOptionCount;
          } catch {
            // 셀피아 상품이 그사이 사라졌거나 쓰지 않게 됐다. 사람이 판매상품 편집에서 다시 잇는다.
          }
        }
      }
    }
    return changed;
  }
}
