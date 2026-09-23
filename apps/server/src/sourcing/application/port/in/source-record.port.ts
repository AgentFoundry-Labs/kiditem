import type { OwnerTransaction } from '../../../../common/owner-transaction';

export const SOURCE_RECORD_PORT = Symbol('SOURCE_RECORD_PORT');

/**
 * 원본 기록(SourceRecord)의 owner 인터페이스 — Sourcing 이 쓰고 Channels 가 부른다(KID-313).
 *
 * 원본 기록은 수집이 남긴 불변 사실이라 운영자 조작(거절 · 삭제)이 없다. 바깥에서 오는 요청은
 * 둘뿐이다: 초안이 원본 사실을 읽는 것, 그리고 초안을 지울 때 원본을 함께 지우는 것. 후자는
 * Channels 의 초안 삭제 트랜잭션 안에서 불리므로 caller 의 트랜잭션을 받는다. Sourcing 표를
 * Channels 가 직접 쓰는 일은 없다.
 */

export type SourceRecordImageView = Readonly<{
  id: string;
  url: string;
  role: string;
  sortOrder: number;
  isPrimary: boolean;
}>;

export type SourceRecordView = Readonly<{
  id: string;
  sourcePlatform: string;
  sourceUrl: string;
  externalOfferId: string | null;
  name: string;
  description: string;
  category: string | null;
  /** 원본 통화 원가. 판매 상품은 이 값을 복사하지 않고 여기서 읽는다. */
  costCny: string | null;
  rawData: Record<string, unknown>;
  images: readonly SourceRecordImageView[];
  collectedAt: string;
}>;

export interface SourceRecordPort {
  /** 초안 화면과 몰 등록이 원본 사실을 읽는 유일한 길. 없으면 null. */
  read(input: { organizationId: string; sourceRecordId: string }): Promise<SourceRecordView | null>;
  readMany(input: { organizationId: string; sourceRecordIds: readonly string[] }): Promise<ReadonlyMap<string, SourceRecordView>>;
  /**
   * 초안 삭제 트랜잭션 안에서 원본 기록과 이미지를 함께 지운다. 이미 없으면 아무것도 하지 않는다.
   * 지운 뒤 같은 원본의 재수집은 새 수집이 된다.
   */
  deleteForDraft(transaction: OwnerTransaction, input: { organizationId: string; sourceRecordId: string }): Promise<void>;
}
