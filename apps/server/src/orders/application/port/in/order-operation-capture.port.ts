import type { OperationKind, OperationView } from '@kiditem/shared/operation';
import type { OwnerTransaction } from '../../../../common/owner-transaction';

export const ORDER_OPERATION_CAPTURE_PORT = Symbol('ORDER_OPERATION_CAPTURE_PORT');

/** 보관할 캡처 한 벌(원천 바이트와 그 이름·형식). */
export interface OrderOperationCaptureSource {
  bytes: Buffer;
  fileName: string | null;
  contentType: string;
}

export interface OrderOperationCapture extends OrderOperationCaptureSource {
  artifactId: string;
}

/**
 * 캡처를 보관하는 Orders 실행 kind(셀피아 송장·몰 주문·directship)의 보관함(KID-359 wave2). 청크는 finish에서
 * 지워지므로(ADR-0025) 나중에 다시 읽을 캡처는 Orders 표 `OrderCollectionArtifact`에 실행 id(스칼라)로 남긴다.
 */
export interface OrderOperationCapturePort {
  /** finalize 트랜잭션 안에서 실행 하나의 캡처를 한 번 보관한다. */
  store(transaction: OwnerTransaction, input: {
    organizationId: string;
    operationId: string;
    source: OrderOperationCaptureSource;
  }): Promise<{ artifactId: string }>;

  /**
   * 성공한 실행(`kind`)의 보관 캡처와 그 실행. 실행이 없거나·다른 조직·다른 kind·아직 성공하지 않았거나 캡처가
   * 없으면 `OPERATION_NOT_FOUND`(details.reason).
   */
  readSucceeded(input: {
    organizationId: string;
    operationId: string;
    kind: OperationKind;
  }): Promise<{ operation: OperationView; capture: OrderOperationCapture }>;
}
