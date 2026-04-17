// apps/server/src/products/dto/list-bundle-components.query.ts
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Service 가 runtime 에서 둘 중 하나 필수 검증 — 두 필드 모두 없으면 400.
 * class-validator 로는 "exactly-one / at-least-one" 를 깔끔히 표현하기 어려워
 * 의도적으로 service 레이어로 검증을 미룸 (plan Step 5-1).
 */
export class ListBundleComponentsQuery {
  @IsOptional() @IsUUID()
  bundleOptionId?: string;

  @IsOptional() @IsUUID()
  componentOptionId?: string;
}
