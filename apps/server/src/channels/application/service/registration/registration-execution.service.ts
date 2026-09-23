import { STOCKOUT_CHECK_PORT, type StockoutCheckPort } from '../../port/in/listing/stockout-check.port';
import type { PrepareListingAvailabilityInput, ReportListingAvailabilityInput } from '@kiditem/shared/sales-product';
import { SALES_PRODUCT_PORT, type SalesProductPort } from '../../port/in/sales-product.port';
import { REGISTRATION_TARGET_PORT, type RegistrationTargetPort } from '../../port/in/registration-target.port';
import { RegistrationTargetException } from '../../exception/registration-target.exception';
import type {
  RegistrationExecutionRepositoryPort,
  TargetExecutionIntent,
} from '../../port/out/repository/registration-execution.repository.port';
import type { PrepareTargetExecutionInput, ReportTargetExecutionInput } from '@kiditem/shared/sales-product';
import type { ChannelRegistrableDetailPagePort } from '../../port/out/content/registrable-detail-page.port';
import type { RegistrationExecutionPort } from '../../port/in/capability/registration-execution.port';

/**
 * 등록 실행 울타리.
 *
 * 재사용 등록 대상의 실행마다 제출 내용을 동결한다. 같은 요청의 재전송은
 * 기존 실행을 반환하고, 시작과 결과 보고(`outcome`)가 이 계약을 통과한다. 몰마다 다른 준비 사실 ·
 * 확인 증거는 fence 가 채널 어댑터로 처리한다(KID-321)
 * ([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 */

export class RegistrationExecutionService implements RegistrationExecutionPort {
  constructor(
    private readonly executions: RegistrationExecutionRepositoryPort,
    private readonly salesProducts: SalesProductPort,
    private readonly targets: RegistrationTargetPort,
    private readonly stockout: StockoutCheckPort,
    /** 몰에 보낼 상세는 Content revision 에서 읽어 실행 payload 에 동결한다(KID-313 W2). */
    private readonly detailPages: ChannelRegistrableDetailPagePort,
  ) {}

  prepareListingAvailability(organizationId: string, userId: string | null, input: PrepareListingAvailabilityInput) {
    return this.executions.prepareListingAvailability({ organizationId, requestedByUserId: userId, request: input });
  }
  listListingAvailability(organizationId: string, userId: string | null, channelAccountId: string, externalListingId: string) {
    return this.executions.listListingAvailability({ organizationId, requestedByUserId: userId, channelAccountId, externalListingId });
  }
  startListingAvailability(organizationId: string, userId: string | null, executionId: string) {
    return this.executions.startListingAvailability({ organizationId, requestedByUserId: userId, executionId,
      assertInventoryStockout: (transaction, snapshot) => this.stockout.assertEligible(transaction, organizationId, snapshot, executionId) });
  }
  reportListingAvailability(organizationId: string, userId: string | null, executionId: string, input: ReportListingAvailabilityInput) {
    return this.executions.reportListingAvailability({ organizationId, requestedByUserId: userId, executionId, report: input });
  }

  async prepareTargetExecution(organizationId: string, targetId: string, userId: string | null, input: PrepareTargetExecutionInput) {
    if (input.kind !== 'register' && !input.channelListingId) {
      throw new RegistrationTargetException('invalid', '기존 쇼핑몰 상품을 선택하세요.');
    }
    if ((input.kind === 'update') !== Boolean(input.updateFields?.length)) {
      throw new RegistrationTargetException('invalid', '가격 수정 실행은 변경할 판매가 항목을 지정해야 합니다.');
    }
    const transitions = input.optionTransitions ?? [];
    if (input.kind === 'composition_change' ? transitions.length === 0 : transitions.length > 0) {
      throw new RegistrationTargetException('invalid', '구성 전환에는 변경할 쇼핑몰 옵션과 새 판매옵션을 지정해야 합니다.');
    }
    if (new Set(transitions.map(item => item.channelListingOptionId)).size !== transitions.length
      || new Set(transitions.map(item => item.salesProductOptionId)).size !== transitions.length) {
      throw new RegistrationTargetException('invalid', '구성 전환 옵션을 중복 지정할 수 없습니다.');
    }
    const replay = await this.executions.findTargetReplay({ organizationId, requestedByUserId: userId, targetId, request: input });
    if (replay) return replay;
    const target = await this.targets.get(organizationId, targetId);
    if (target.version !== input.expectedVersion) throw new RegistrationTargetException('conflict', '등록 설정이 변경됐습니다. 다시 불러오세요.');
    const product = await this.salesProducts.get(organizationId, target.salesProductId);
    if (target.selectedOptions.length === 0) throw new RegistrationTargetException('invalid', '실행할 옵션을 선택하세요.');
    const options = new Map(product.options.map(option => [option.id, option]));
    if (transitions.some(item => !target.selectedOptions.some(option => option.salesProductOptionId === item.salesProductOptionId))) {
      throw new RegistrationTargetException('invalid', '새 판매옵션이 등록 대상에 선택되어 있지 않습니다.');
    }
    if (input.kind === 'update') {
      const listing = product.channelListings.find(item => item.id === input.channelListingId
        && item.channelAccountId === target.channelAccountId);
      const optionId = listing?.options.length === 1 ? listing.options[0]?.salesProductOptionId : null;
      const selection = target.selectedOptions.find(item => item.salesProductOptionId === optionId);
      const option = optionId ? options.get(optionId) : undefined;
      if (!listing || !selection || !option) {
        throw new RegistrationTargetException('invalid', '가격 수정은 등록 대상에 선택된 단일 옵션의 몰 상품만 지원합니다.');
      }
      // 가격은 판매 상품 옵션 한 곳에만 있다(KID-313 W2).
      const price = option.salePrice;
      if (price === null || !['kakao', 'kidsnote'].includes(listing.mallKey) || price < 10 || price > 10_000_000) {
        throw new RegistrationTargetException('invalid', '이 몰 또는 판매가는 현재 가격 전송 범위에 포함되지 않습니다.');
      }
    }
    // 상세는 새 상품 문서를 보내는 실행(등록 · 구성 전환)만 얼린다 — 나머지 kind 는 읽지도 않는다.
    const detail = input.kind === 'register' || input.kind === 'composition_change'
      ? await this.detailPages.read({
        organizationId,
        salesProductId: target.salesProductId,
        selectedDetailPageRevisionId: target.selectedDetailPageRevisionId,
      })
      : null;
    // 몰마다 다른 준비 사실(`adapterPayload`)은 fence 가 준비 트랜잭션 안에서 채널 어댑터로 채운다.
    const snapshot: TargetExecutionIntent = {
      targetId, targetVersion: target.version, channelAccountId: target.channelAccountId,
      kind: input.kind, channelListingId: input.channelListingId ?? null,
      ...(input.updateFields ? { updateFields: input.updateFields } : {}),
      ...(input.adapterDefaults ? { adapterDefaults: input.adapterDefaults } : {}),
      ...(input.adapterValues ? { adapterValues: input.adapterValues } : {}),
      applyCompositionTemplate: input.applyCompositionTemplate,
      optionTransitions: transitions,
      product: {
        // 이름 · 가격은 판매 상품 그대로다 — 등록 대상은 사본을 갖지 않는다(KID-313 W2).
        ...product,
        channelOverrides: [],
        options: target.selectedOptions.map(selection => {
          const option = options.get(selection.salesProductOptionId);
          if (!option) throw new RegistrationTargetException('invalid', '선택한 옵션이 해당 판매상품에 없습니다.');
          return option;
        }),
      },
      detailPage: detail ? { revisionId: detail.revisionId, html: detail.html } : null,
      registrationInput: target.registrationInput,
    };
    return this.executions.prepareTarget({ organizationId, requestedByUserId: userId, request: input, snapshot });
  }

  startTargetExecution(organizationId: string, executionId: string, userId: string | null) {
    return this.executions.startTarget({ organizationId, executionId, requestedByUserId: userId });
  }
  listTargetExecutions(organizationId: string, targetId: string, userId: string | null) {
    return this.executions.listTarget({ organizationId, targetId, requestedByUserId: userId });
  }

  getTargetExecution(organizationId: string, executionId: string, userId: string | null) {
    return this.executions.getTarget({ organizationId, executionId, requestedByUserId: userId });
  }
  reportTargetExecution(organizationId: string, executionId: string, userId: string | null, input: ReportTargetExecutionInput) {
    return this.executions.reportTarget({ organizationId, executionId, requestedByUserId: userId, report: input });
  }
}
