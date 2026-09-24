
import type { RegistrationTarget, RegistrationTargetResolveInput, RegistrationTargetUpdateInput } from '@kiditem/shared/sales-product';
import type { RegistrationTargetPort } from '../../port/in/registration-target.port';
import { REGISTRATION_TARGET_REPOSITORY_PORT, type RegistrationTargetRecord, type RegistrationTargetRepositoryPort } from '../../port/out/persistence/registration-target.repository.port';
import { KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';


export class RegistrationTargetUseCase implements RegistrationTargetPort {
  constructor( private readonly repository: RegistrationTargetRepositoryPort) {}

  async resolve(organizationId: string, input: RegistrationTargetResolveInput): Promise<RegistrationTarget> {
    return this.get(organizationId, await this.repository.resolve(organizationId, input));
  }

  async list(organizationId: string, salesProductId: string): Promise<RegistrationTarget[]> {
    return (await this.repository.list(organizationId, salesProductId)).map(resolveTarget);
  }
  async get(organizationId: string, targetId: string): Promise<RegistrationTarget> {
    const target = await this.repository.get(organizationId, targetId);
    if (!target) throw new KiditemNotFoundError('CHANNELS_REGISTRATION_TARGET_NOT_FOUND');
    return resolveTarget(target);
  }
  async archive(organizationId: string, targetId: string): Promise<void> {
    await this.repository.archive(organizationId, targetId);
  }
  async update(organizationId: string, targetId: string, input: RegistrationTargetUpdateInput): Promise<RegistrationTarget> {
    await this.repository.update(organizationId, targetId, input);
    return this.get(organizationId, targetId);
  }
}

function resolveTarget(record: RegistrationTargetRecord): RegistrationTarget {
  const { product, ...target } = record;
  const byId = new Map(product.options.map(option => [option.id, option]));
  return {
    ...target,
    resolved: {
      // 등록 대상은 이름과 가격을 저장하지 않는다 — 판매 상품 · 옵션이 정본이다(KID-313 W2).
      name: product.name,
      options: record.selectedOptions.map(selection => {
        const option = byId.get(selection.salesProductOptionId);
        if (!option) throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '선택한 옵션이 해당 판매상품에 없습니다.' });
        return {
          salesProductOptionId: option.id, code: option.code, values: option.values,
          salePrice: option.salePrice,
          normalPrice: option.normalPrice,
        };
      }),
    },
  } satisfies RegistrationTarget;
}
