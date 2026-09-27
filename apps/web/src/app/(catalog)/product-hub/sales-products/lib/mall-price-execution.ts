import {
  newRegistrationIdempotencyKey,
  readRegistrationOperation,
  RegistrationOperationInProgress,
  startRegistrationOperation,
  waitForRegistrationOperation,
  type RegistrationOperationRead,
} from '@/app/(channels)/_shared/registration-operation';
import { registrationTargetApi } from '@/lib/registration-target-api';
import { MALL_PRICE_SEND_NOTE } from './mall-price-send';
import type { RegistrationTarget, SalesProduct } from '@kiditem/shared/sales-product';

export type TargetPriceSelectionReason =
  | 'ready'
  | 'no-target'
  | 'listing-option-unlinked'
  | 'target-option-unselected';

export interface TargetPriceSelection {
  target: RegistrationTarget;
  listingOption: SalesProduct['channelListings'][number]['options'][number];
  targetOption: RegistrationTarget['resolved']['options'][number];
  salesProductOptionId: string;
}

export interface TargetPriceResolution {
  candidates: RegistrationTarget[];
  reason: TargetPriceSelectionReason;
  selection: TargetPriceSelection | null;
}

/**
 * Resolve a price-update target only through the listing's exact channel account and option link.
 *
 * 상품 × 몰 계정당 등록 설정은 하나뿐이다(부분 유일키, 사용자 결정 01:12) — 고를 것이 없다.
 */
export function resolveTargetPrice(
  listing: SalesProduct['channelListings'][number],
  targets: readonly RegistrationTarget[],
): TargetPriceResolution {
  const candidates = targets.filter((target) => target.channelAccountId === listing.channelAccountId);
  if (candidates.length === 0) {
    return { candidates: [], reason: 'no-target', selection: null };
  }

  const listingOption = listing.options.length === 1 ? listing.options[0] : undefined;
  const salesProductOptionId = listingOption?.salesProductOptionId ?? null;
  if (!listingOption || !salesProductOptionId) {
    return { candidates: [...candidates], reason: 'listing-option-unlinked', selection: null };
  }

  const target = candidates[0];
  if (!target) {
    return { candidates: [...candidates], reason: 'no-target', selection: null };
  }

  const targetOption = target.resolved.options.find((option) => option.salesProductOptionId === salesProductOptionId);
  if (!targetOption) {
    return { candidates: [...candidates], reason: 'target-option-unselected', selection: null };
  }

  return {
    candidates: [...candidates],
    reason: 'ready',
    selection: { target, listingOption, targetOption, salesProductOptionId },
  };
}

export interface MallPriceRun {
  /** 시작했거나 이미 돌던 실행. 시작 전에 막혔으면 null. */
  operation: RegistrationOperationRead | null;
  /** 이번 호출이 새 실행을 시작했다. */
  sent: boolean;
  /** 서버가 몰 재조회 증거로 확인했다. */
  confirmed: boolean;
  /** 몰에 닿지 않고 끝났다(실패 · 멈춤) — 새 시작을 열어도 된다. */
  failed: boolean;
  message: string;
}

const CONFIRMED = '몰 가격을 확인했습니다.';
const PRICE_CHANGED = '가격이 바뀌었습니다. 몰에서 보일 가격을 다시 확인한 뒤 보내세요.';
const UNCONFIRMED = '몰에 가격을 보냈지만 확인 결과가 없습니다. 다시 보내지 않고 몰에서 확인을 기다립니다.';
const RUNNING = '가격 보내기가 아직 끝나지 않았습니다. 잠시 뒤 다시 확인하세요.';

function priceRun(mallKey: string, operation: RegistrationOperationRead, sent: boolean): MallPriceRun {
  const failed = operation.state === 'failed' || operation.state === 'cancelled';
  const confirmed = operation.state === 'confirmed';
  const message = failed
    ? operation.message ?? '가격을 보내지 못했습니다.'
    : confirmed
      ? CONFIRMED
      : operation.state === 'running'
        ? RUNNING
        : MALL_PRICE_SEND_NOTE[mallKey] ?? UNCONFIRMED;
  return { operation, sent, confirmed, failed, message };
}

/**
 * 몰 가격 보내기(KID-247) = 등록 실행 `update` + `updateFields: ['salePrice']` 하나(KID-364). 보낼 가격과 몰에서 본 지금
 * 가격(덮어쓰기 방지)은 서버 plan이 등록 대상에서 얼리고, 확장 몰 쓰기 모듈이 보내고 다시 읽는다. 보냈다와 확인했다는
 * 다르다 — 확인은 서버가 몰 증거로 판정한다. 같은 몰 상품의 실행이 이미 있으면 다시 보내지 않는다.
 */
export async function executeTargetMallPrice(
  input: {
    salesProductId: string;
    channelAccountId: string;
    expectedPrice: number;
    listingId: string;
    mallKey: string;
    idempotencyKey: string;
    /** 이 몰 상품(옵션 하나)에 이어진 판매 옵션. 사람이 본 가격을 등록 설정의 확정 가격과 대조한다. */
    salesProductOptionId: string;
  },
  resolveTarget = registrationTargetApi.resolve,
): Promise<MallPriceRun> {
  const target = await resolveTarget({
    salesProductId: input.salesProductId,
    channelAccountId: input.channelAccountId,
  });
  if (target.channelAccountId !== input.channelAccountId || target.salesProductId !== input.salesProductId) {
    throw new Error('몰별 등록 설정의 상품과 계정을 확인할 수 없습니다.');
  }
  // 사람이 확인한 가격이 지금 등록 설정의 확정 가격과 같을 때만 보낸다 — 그사이 바뀐 가격을 모르고 보내지 않게.
  const settled = target.resolved.options.find((option) => option.salesProductOptionId === input.salesProductOptionId);
  if (!settled || settled.salePrice !== input.expectedPrice) {
    throw new Error(PRICE_CHANGED);
  }
  let operationId: string;
  try {
    ({ operationId } = await startRegistrationOperation({
      mallKey: input.mallKey,
      idempotencyKey: input.idempotencyKey || newRegistrationIdempotencyKey('price'),
      scope: {
        executionKind: 'update',
        updateFields: ['salePrice'],
        registrationTargetId: target.id,
        expectedVersion: target.version,
        channelListingId: input.listingId,
        applyCompositionTemplate: false,
        // 사람이 보낼 가격을 보고 한 번 더 눌렀다 — 쓰기 의도. 누를지는 확장 관문이 다시 정한다.
        submit: true,
      },
    }));
  } catch (error) {
    if (!(error instanceof RegistrationOperationInProgress)) throw error;
    const existing = error.existingOperationId ? await readRegistrationOperation(error.existingOperationId) : null;
    return { operation: existing, sent: false, confirmed: false, failed: false, message: error.message };
  }
  return priceRun(input.mallKey, await waitForRegistrationOperation(operationId), true);
}
