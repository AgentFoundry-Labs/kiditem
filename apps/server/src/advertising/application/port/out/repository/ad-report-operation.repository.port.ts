import type { AdReportAd, AdReportCampaign } from '@kiditem/shared/advertising-operations';
import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { AdReportBilling } from '../../../../domain/ad-report-billing';
import type {
  AdReportDeletedCampaign,
  AdReportKeywordFact,
  AdReportProductFact,
} from '../../../../domain/ad-report-operation';

export const AD_REPORT_OPERATION_REPOSITORY_PORT = Symbol('AdReportOperationRepositoryPort');

/**
 * `advertising.ad_report`의 원장 쓰기(KID-371). 광고 원장 5표를 쓰는 유일한 길이고, 쓰기는 finish 트랜잭션 안에서만.
 */
export interface AdReportOperationRepositoryPort {
  /** 활성 쿠팡 계정과 그 업체코드(없으면 null). 계정이 없으면 null. `transaction`이 없으면 자기 읽기로 본다(plan). */
  readAccount(
    organizationId: string,
    channelAccountId: string,
    transaction?: OwnerTransaction,
  ): Promise<{ id: string; vendorId: string | null } | null>;
  /**
   * 확정 창 [startDate, endDate]의 상품·키워드 사실과 정산 행을 지우고 새로 넣고, 캠페인·광고 현재 상태를 upsert한다.
   * 상품 행의 리스팅은 Channels 카탈로그(광고 옵션 = 옵션 외부 id)로 맞추고 못 맞추면 null로 둔다.
   */
  publish(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      operationId: string;
      channelAccountId: string;
      startDate: string;
      endDate: string;
      observedAt: Date;
      products: readonly AdReportProductFact[];
      keywords: readonly AdReportKeywordFact[];
      billings: readonly AdReportBilling[];
      campaigns: readonly AdReportCampaign[];
      deletedCampaigns: readonly AdReportDeletedCampaign[];
      ads: readonly AdReportAd[];
    },
  ): Promise<void>;
}
