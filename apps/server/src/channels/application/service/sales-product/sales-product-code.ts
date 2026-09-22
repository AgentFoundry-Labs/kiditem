import type { SalesProductOptionReplacementPlan } from '../../../domain/sales-product/sales-product';
import type { SalesProductRepositoryPort } from '../../port/out/persistence/sales-product.repository.port';

/**
 * 가져오기(사방넷)가 쓰는 단품 KID 발급. 운영 경로의 발급은 `ensureSalesProductCodes` 하나다 —
 * 이 함수는 품번코드를 이미 들고 오는 이관 · 가져오기에서만 쓴다.
 */
export async function issueSalesProductOptionCodes(
  organizationId: string,
  plan: SalesProductOptionReplacementPlan,
  repository: Pick<SalesProductRepositoryPort, 'readMasterProductCodes' | 'allocateCode'>,
): Promise<void> {
  const created = plan.writes.filter(option => option.id === null);
  if (created.length === 0) return;
  const sourceCodes = await repository.readMasterProductCodes(organizationId,
    created.flatMap(option => option.components.map(component => component.masterProductId)));
  for (const option of created) {
    const component = option.components.length === 1 ? option.components[0] : undefined;
    const sourceCode = !option.replacesOptionId && component?.quantity === 1
      ? sourceCodes.get(component.masterProductId) : undefined;
    option.optionCode = sourceCode ?? await repository.allocateCode(organizationId);
  }
}
