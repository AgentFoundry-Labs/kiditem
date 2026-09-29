import type {
  SellpiaTransferOutcomeStatus,
  SellpiaTransferSourceRef,
} from '../../../../../orders/application/port/in/capability/sellpia-transfer-outcome.port';

export interface RocketWorkbookProgressRepositoryPort {
  /**
   * 워크북 진행의 입력: Sellpia 재고 상태의 검증 세대와, 수집된 파일마다 Orders 전송 결과 capability가 비춘
   * 가장 최근 전송 실행 상태(입력 순서대로). Orders 표를 직접 읽지 않는다(KID-388, ADR-0021).
   */
  read(input: {
    transaction: unknown;
    organizationId: string;
    transmissionSources: readonly SellpiaTransferSourceRef[];
  }): Promise<{
    verifiedGeneration: bigint;
    transferStatuses: SellpiaTransferOutcomeStatus[];
  }>;
}

export const ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT = Symbol(
  'ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT',
);
