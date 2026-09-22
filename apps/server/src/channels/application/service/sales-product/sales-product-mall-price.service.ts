import type { SalesProductMallPricePort } from "../../port/in/sales-product/sales-product-mall-price.port";
import type { ChannelActivityPort } from '../../port/out/alerts/channel-activity.port';

import type { SalesProductMallPriceAdoption } from '@kiditem/shared/sales-product';
import { planMallPriceAdoption } from '../../../domain/sales-product/sales-product-mall-prices';
import {
  SALES_PRODUCT_REPOSITORY_PORT,
  type SalesProductRepositoryPort,
} from '../../port/out/persistence/sales-product.repository.port';

const CONFLICT_SAMPLES = 20;

/**
 * 몰에 지금 걸린 옵션별 최종 가격이 등록 대상의 가격과 다르면, 기존
 * 등록 대상의 선택 옵션만 몰 가격에 맞춘다. 대상이 없거나 여러 개면
 * 계획 단계에서 충돌로 남기며 새 대상을 만들지 않는다.
 */

export class SalesProductMallPriceService implements SalesProductMallPricePort {


  constructor(

    private readonly repository: SalesProductRepositoryPort,
    private readonly logger: ChannelActivityPort,
  ) {}

  async adopt(organizationId: string, apply: boolean): Promise<SalesProductMallPriceAdoption> {
    const [candidates, accounts] = await Promise.all([
      this.repository.readMallPriceCandidates(organizationId),
      this.repository.listChannelAccounts(organizationId),
    ]);
    const plan = planMallPriceAdoption(candidates);
    if (apply && plan.writes.length > 0) {
      await this.repository.setChannelOverrideSalePrices(organizationId, plan.writes);
    }
    const productById = new Map(candidates.products.map((product) => [product.id, product]));
    const mallNameById = new Map(accounts.map((account) => [account.id, account.name]));
    const byMall: Record<string, number> = {};
    for (const write of plan.writes) {
      const mallName = mallNameById.get(write.channelAccountId) ?? write.channelAccountId;
      byMall[mallName] = (byMall[mallName] ?? 0) + 1;
    }
    const result: SalesProductMallPriceAdoption = {
      applied: apply,
      pairs: plan.writes.length,
      products: new Set(plan.writes.map((write) => write.salesProductId)).size,
      unchanged: plan.unchanged,
      conflicts: plan.conflicts.length,
      conflictSamples: plan.conflicts.slice(0, CONFLICT_SAMPLES).map((conflict) => ({
        code: productById.get(conflict.salesProductId)?.code ?? '',
        name: productById.get(conflict.salesProductId)?.name ?? '',
        mallName: mallNameById.get(conflict.channelAccountId) ?? '',
        reason: conflict.reason,
        prices: conflict.prices,
      })),
      byMall,
    };
    if (apply) {
      this.logger.log(
        `몰 옵션 가격을 등록 대상에 반영 org=${organizationId} 상품 × 몰 ${result.pairs} · 그대로 ${result.unchanged} · 엇갈림 ${result.conflicts}`,
      );
    }
    return result;
  }
}
