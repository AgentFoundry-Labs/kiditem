import { Global, Module } from '@nestjs/common';

/**
 * Common module — 현재는 비어 있음. 모듈 자체는 유지하여 향후 common util
 * (filter, interceptor, pipe 등)을 추가할 때 도메인 모듈이 재등록 없이 사용.
 * CompanyResolverService 는 ADR-0006 (2026-04-14) 채택 후 제거 — @CurrentOrganization()
 * + OrganizationScopeGuard 로 대체.
 */
@Global()
@Module({
  providers: [],
  exports: [],
})
export class CommonModule {}
