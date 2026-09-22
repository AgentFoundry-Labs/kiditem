
import type { RegistrationTarget, RegistrationTargetCreateInput, RegistrationTargetResolveInput, RegistrationTargetUpdateInput } from '@kiditem/shared/sales-product';
import type { RegistrationTargetPort } from '../../port/in/registration-target.port';
import { REGISTRATION_TARGET_REPOSITORY_PORT, type RegistrationTargetRecord, type RegistrationTargetRepositoryPort } from '../../port/out/persistence/registration-target.repository.port';
import { RegistrationTargetException } from '../../exception/registration-target.exception';


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
    if (!target) throw new RegistrationTargetException('not_found', '등록 설정을 찾지 못했습니다.');
    return resolveTarget(target);
  }
  async create(organizationId: string, input: RegistrationTargetCreateInput): Promise<RegistrationTarget> {
    return this.get(organizationId, await this.repository.create(organizationId, input));
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
      name: record.displayName ?? product.name,
      options: record.selectedOptions.map(selection => {
        const option = byId.get(selection.salesProductOptionId);
        if (!option) throw new RegistrationTargetException('invalid', '선택한 옵션이 해당 판매상품에 없습니다.');
        return {
          salesProductOptionId: option.id, code: option.code, values: option.values,
          salePrice: selection.salePrice ?? option.salePrice,
          normalPrice: selection.normalPrice ?? option.normalPrice,
          supplyPrice: selection.supplyPrice,
        };
      }),
    },
  } satisfies RegistrationTarget;
}
