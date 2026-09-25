import { SetMetadata } from '@nestjs/common';

export const OPERATION_OWNER_METADATA = 'kiditem:operation-owner';

/**
 * owner 모듈의 provider 클래스에 붙이면 부팅 때 그 kind가 실행 계약에 등록된다(`OperationOwnerRegistry`).
 * owner가 계약의 구현(service)을 가져오지 않도록 포트 옆에 둔다.
 */
export const OperationOwner = (): ClassDecorator => SetMetadata(OPERATION_OWNER_METADATA, true);
