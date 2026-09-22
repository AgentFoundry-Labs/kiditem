import type { SalesProductOptionReplacementPlan } from '../../domain/sales-product';
import type { SalesProductRepositoryPort } from '../port/out/persistence/sales-product.repository.port';

/** Codes are issued once by the shared sequence; known singleton units may reuse their source KID. */
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
