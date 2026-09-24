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
 * 몰에 지금 걸린 옵션 판매가가 판매 상품 단품 판매가와 다르면 단품 판매가를 몰 가격에 맞춘다(KID-313 W2).
 * 같은 단품이 몰마다 다른 값이면 계획 단계에서 충돌로 남기고 쓰지 않는다.
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
      await this.repository.applyMallPriceAdoption(organizationId, plan.writes);
    }
    const productById = new Map(candidates.products.map((product) => [product.id, product]));
    const mallNameById = new Map(accounts.map((account) => [account.id, account.name]));
    const byMall: Record<string, number> = {};
    for (const write of plan.writes) {
      for (const accountId of write.channelAccountIds) {
        const mallName = mallNameById.get(accountId) ?? accountId;
        byMall[mallName] = (byMall[mallName] ?? 0) + 1;
      }
    }
    const result: SalesProductMallPriceAdoption = {
      applied: apply,
      pairs: plan.writes.reduce((sum, write) => sum + write.channelAccountIds.length, 0),
      products: new Set(plan.writes.map((write) => write.salesProductId)).size,
      unchanged: plan.unchanged,
      conflicts: plan.conflicts.length,
      conflictSamples: plan.conflicts.slice(0, CONFLICT_SAMPLES).map((conflict) => ({
        code: productById.get(conflict.salesProductId)?.code ?? '',
        name: productById.get(conflict.salesProductId)?.name ?? '',
        mallName: conflict.channelAccountIds.map((id) => mallNameById.get(id) ?? '').filter(Boolean).join(', '),
        reason: conflict.reason,
        prices: conflict.prices,
      })),
      byMall,
    };
    if (apply) {
      this.logger.log(
        `몰 옵션 가격을 판매 상품 단품에 반영 org=${organizationId} 상품 × 몰 ${result.pairs} · 그대로 ${result.unchanged} · 엇갈림 ${result.conflicts}`,
      );
    }
    return result;
  }
}
