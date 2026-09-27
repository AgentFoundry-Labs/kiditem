import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type {
  AdCoverage,
  AdListingWindowFacts,
  AdWindowFacts,
} from '../../in/capability/advertising-ledger-read.port';

export const AD_LEDGER_READ_REPOSITORY_PORT = Symbol('AdLedgerReadRepositoryPort');

/** 조직·활성 계정·달력일 창으로 좁힌 원장 읽기 범위. 활성 계정은 application 서비스가 Channels capability로 구한다. */
export type AdLedgerReadScope = Readonly<{
  organizationId: string;
  activeAccountIds: readonly string[];
  /** 달력일 `YYYY-MM-DD`, 포함. */
  from?: string;
  /** 달력일 `YYYY-MM-DD`, 제외. */
  to?: string;
}>;

/**
 * 새 광고 원장(상품 사실 표·정산 표)과 `advertising.ad_report` 실행 창을 읽는 출력 포트(KID-372).
 * 구현은 `adapter/out/persistence/ad-ledger-read.persistence.adapter.ts`. KID-372 ①a는 캠페인·상품·키워드 rollup을,
 * ①b는 월 배분을 이 포트에 더한다(같은 어댑터 파일에 메서드 추가, 새 `read/` 폴더는 만들지 않는다 — ADR-0021).
 */
export interface AdLedgerReadRepositoryPort {
  readAdCoverage(transaction: OwnerTransaction, scope: AdLedgerReadScope): Promise<AdCoverage>;
  readAdWindowFacts(transaction: OwnerTransaction, scope: AdLedgerReadScope): Promise<AdWindowFacts>;
  readListingAdWindowFacts(transaction: OwnerTransaction, scope: AdLedgerReadScope): Promise<AdListingWindowFacts[]>;
  /** 활성 계정마다 가장 최근 성공한 광고 보고서 실행의 요청 끝·확정 끝(없으면 `null`), `activeAccountIds` 순서. */
  readNewestAdReportEnds(
    transaction: OwnerTransaction,
    scope: Pick<AdLedgerReadScope, 'organizationId' | 'activeAccountIds'>,
  ): Promise<Array<Readonly<{ requestedEnd: string; confirmedEnd: string }> | null>>;
}
