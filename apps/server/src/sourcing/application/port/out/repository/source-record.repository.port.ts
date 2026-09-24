import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { SalesProductDraftPort } from '../cross-domain/sales-product-draft.port';

export const SOURCE_RECORD_REPOSITORY_PORT = Symbol('SOURCE_RECORD_REPOSITORY_PORT');

export interface SourceRecordImageWrite {
  url: string;
  role: string;
  label: string | null;
  sortOrder: number;
  source: string;
  isPrimary: boolean;
}

/**
 * 한 번의 수집이 원천에서 가져온 사실(KID-313). 원본 기록은 이 값으로 한 번 만들어지고 바뀌지
 * 않는다 — 운영자가 고치는 것은 초안이다. 식별자(`sourceIdentityHash`)는 모든 수집 경로가 같은
 * 규칙(`source-record-identity`)으로 만든다.
 */
export interface SourceRecordWrite {
  organizationId: string;
  sourceUrl: string;
  sourcePlatform: string;
  externalOfferId: string | null;
  variantKeyNormalized: string;
  sourceIdentityHash: string;
  rawData: object;
  name: string;
  description: string;
  category: string | null;
  tags: string[];
  thumbnailUrl: string | null;
  imageUrl: string | null;
  costCny: number | null;
  triggeredByUserId: string | null;
  images: SourceRecordImageWrite[];
}

/** 입장한 원본 기록과, 같은 트랜잭션에서 만든 그 초안. */
export interface AdmittedSourceRecord {
  sourceRecordId: string;
  salesProductId: string;
}

/** 한 번만 받는 owner 명령의 영수증 좌표. 같은 키로 다른 요청이 오면 충돌이다. */
export interface OwnerReceiptKey {
  organizationId: string;
  capabilityKey: string;
  idempotencyKey: string;
  requestHash: string;
}

/**
 * 원본 기록 저장소(Sourcing 소유). 입장은 식별자 advisory lock 안에서 `admitSourceRecord` 가
 * 정하고, 기록과 그 초안이 한 커밋이다 — 초안 없는 원본 기록은 생기지 않는다. 초안은 Channels 것이라
 * 부르는 쪽이 넘긴 초안 계약(`drafts`)으로만 만든다.
 */
export interface SourceRecordRepositoryPort {
  /** 원본 기록 없이 초안만 만드는 직접 작성이 Channels 에 넘길 트랜잭션. */
  runInTransaction<T>(work: (transaction: OwnerTransaction) => Promise<T>): Promise<T>;
  /** 같은 공급사 주소로 이미 수집한 원본 기록. 입장 전에 화면에 알려 줄 때만 쓴다 — 결정은 입장이 한다. */
  findIdBySourceUrl(organizationId: string, sourceUrl: string): Promise<string | null>;
  /** 원본 기록을 입장시키고 그 초안을 만든다. 거절이면 `SourceRecordDuplicateError`. */
  admit(input: SourceRecordWrite, drafts: SalesProductDraftPort): Promise<AdmittedSourceRecord>;
  /** 영수증과 입장을 한 트랜잭션에서 한다. 같은 키 · 같은 요청의 재생은 처음 결과를 돌려준다. */
  admitOnce(
    receipt: OwnerReceiptKey,
    input: SourceRecordWrite,
    drafts: SalesProductDraftPort,
  ): Promise<AdmittedSourceRecord>;
  /**
   * 영수증을 잡고 `work` 를 한 번만 한다(원본 기록이 없는 직접 작성 초안). 결과는 문자열 칸만 담는
   * 객체이고, 재생은 저장한 결과를 그대로 돌려준다.
   */
  runOnce<T extends Record<string, string>>(
    receipt: OwnerReceiptKey,
    work: (transaction: OwnerTransaction) => Promise<T>,
  ): Promise<T>;
  /** 생성 시작을 한 번만 받는 영수증. 대상은 판매상품 초안이다(KID-310). */
  claimQuickProcess(input: {
    organizationId: string;
    salesProductId: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ salesProductId: string }>;
}
