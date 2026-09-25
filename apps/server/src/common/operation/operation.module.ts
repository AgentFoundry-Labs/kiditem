import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { OperationsController } from './adapter/in/web/operations.controller';
import { OperationRepositoryAdapter } from './adapter/out/repository/operation.repository.adapter';
import { OPERATION_PORT } from './application/port/in/operation.port';
import { OPERATION_REPOSITORY } from './application/port/out/repository/operation.repository.port';
import { OperationOwnerRegistry } from './application/service/operation-owner.registry';
import { OperationService } from './application/service/operation.service';

/**
 * 실행 계약(ADR-0025). owner는 kind마다 `OperationOwnerPort` 구현에 `@OperationOwner()`를 붙여 자기 모듈의
 * provider로 두면 부팅 때 등록된다. 이 모듈 밖에서 실행 표를 만지는 코드는 없다(`check:operation-owner-boundary`).
 */
@Module({
  imports: [DiscoveryModule],
  controllers: [OperationsController],
  providers: [
    OperationOwnerRegistry,
    OperationService,
    { provide: OPERATION_PORT, useExisting: OperationService },
    { provide: OPERATION_REPOSITORY, useClass: OperationRepositoryAdapter },
  ],
  exports: [OPERATION_PORT],
})
export class OperationModule {}
