import type { TestingModule } from '@nestjs/testing';
import { OperationOwnerRegistry } from '../../../common/operation/application/service/operation-owner.registry';
import { AdActionOperationOwner } from '../../adapter/in/operation/ad-action-operation-owner';

/**
 * 모듈을 `init` 하지 않는 PG 스펙에서 광고 액션 kind를 켠다(부팅 때 `OperationOwnerRegistry.onModuleInit`이 하는 일).
 * `init`은 다른 모듈의 부팅 훅(워커·예약)을 함께 돌리므로 부르지 않는다.
 */
export function enableAdActionOperations(module: TestingModule): void {
  module.get(OperationOwnerRegistry, { strict: false }).register(module.get(AdActionOperationOwner, { strict: false }));
}
