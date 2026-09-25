import type { OperationPlanResult, OperationStagedChunk, OperationView } from '@kiditem/shared/operation';
import type { WingCatalogListResult, CoupangCatalogCollectionQuality } from '@kiditem/shared/coupang-catalog-snapshot';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { CatalogChanges } from '../out/repository/channel-catalog-publication.port';

export const WING_CATALOG_OPERATION_PORT = Symbol('WING_CATALOG_OPERATION_PORT');

type PlanContext = { organizationId: string; userId: string | null };
type FinalizeContext = { tx: OwnerTransaction; organizationId: string; operationId: string; plan: Record<string, unknown> };

/**
 * Wing 카탈로그 실행 kind 셋(KID-354·351)의 owner 일. owner 포트 셋(adapter/in/operation)과 엑셀 업로드 컨트롤러가
 * 이 창구만 쓴다. `plan*`은 scope 검증·잠금 키, `finalize*`는 finish 트랜잭션 안의 반영이다.
 */
export interface WingCatalogOperationPort {
  planList(scope: Record<string, unknown>, context: PlanContext): Promise<OperationPlanResult>;
  finalizeList(chunks: OperationStagedChunk[], context: FinalizeContext): Promise<WingCatalogListResult>;
  planDetails(scope: Record<string, unknown>, context: PlanContext): Promise<OperationPlanResult>;
  finalizeDetails(chunks: OperationStagedChunk[], context: FinalizeContext): Promise<CoupangCatalogCollectionQuality>;
  planExcel(scope: Record<string, unknown>, context: PlanContext): Promise<OperationPlanResult>;
  finalizeExcel(chunks: OperationStagedChunk[], context: FinalizeContext): Promise<CatalogChanges & { skippedRowCount: number }>;
  /** 웹 업로드 = 서버가 스스로 확장 역할을 하는 엑셀 kind 실행 하나. */
  uploadWorkbook(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    bytes: Uint8Array;
    observedAt?: string;
  }): Promise<{ operation: OperationView }>;
}
