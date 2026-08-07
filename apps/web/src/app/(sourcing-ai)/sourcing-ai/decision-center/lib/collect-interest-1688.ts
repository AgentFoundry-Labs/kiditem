import { append1688NewProductSnapshot } from '../../lib/1688-new-product-snapshot';
import {
  collect1688TrendsFromChrome,
  TrendExtensionError,
} from '../../market/lib/1688-trend-extension';
import { fetch1688HotProducts, type Hot1688OfferView } from '../../market/lib/trend-collection-api';

/**
 * 관심 키워드로 1688 공급 후보를 수집한다.
 *
 * 서버 Playwright 로는 수집할 수 없다 — 알리바바가 프로그램 접근을 봇으로 판정해
 * `/_____tmd_____/punish` 로 돌린다(운영자 본인의 로그인된 Chrome 에 붙여도 동일).
 * 그래서 다른 몰 수집과 같은 방식으로, **운영자가 평소 쓰는 브라우저 안에서 도는
 * 확장 프로그램**에 맡긴다. 확장은 슬라이더 검증이 뜨면 우회하지 않고 탭을 열어 둔 채
 * `attention_required` 로 운영자에게 넘긴다.
 *
 * 수집 자체는 기존 1688 트렌드 수집기를 그대로 재사용하고, 이 함수는 그 결과를
 * 추천 표가 읽는 `1688_new_products` 스냅샷으로 옮기는 일만 한다.
 */
export interface CollectInterest1688Result {
  runId: string;
  /** 확장이 이번 실행에서 수집한 오퍼 수(트렌드 테이블 기준). */
  collected: number;
  /**
   * 추천 표 스냅샷으로 **옮겨 담은** 행 수.
   *
   * "새로 추가된 수"가 아니다 — 스냅샷 병합이 기존 항목과 중복을 제거하므로, 이 중
   * 일부는 이미 표에 있던 것일 수 있다. 병합은 공유 함수 안에서 일어나 여기서는
   * 최종 증가분을 알 수 없다. 화면 문구도 "추가"가 아니라 "반영"으로 쓴다.
   */
  merged: number;
  errors: Array<{ keyword: string; message: string }>;
}

/** 확장이 한 번에 처리할 키워드 상한. 트렌드 수집기와 같은 값을 쓴다. */
const MAX_KEYWORDS = 20;

export async function collectInterestKeywordsFrom1688(
  keywords: readonly string[],
  onRunStarted?: (runId: string) => void,
  signal?: AbortSignal,
): Promise<CollectInterest1688Result> {
  const targets = Array.from(
    new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean)),
  ).slice(0, MAX_KEYWORDS);

  if (targets.length === 0) {
    throw new TrendExtensionError('collection_failed', '수집할 관심 키워드가 없습니다.');
  }

  const run = await collect1688TrendsFromChrome(targets, onRunStarted, signal);

  // 확장은 결과를 트렌드 테이블에 적재한다. 추천 표는 다른 스냅샷을 읽으므로 옮겨 담는다.
  // 오늘자만 읽으면 자정 근처에서 놓칠 수 있어 2일을 읽고 키워드로 좁힌다.
  const hot = await fetch1688HotProducts(2);
  const wanted = new Set(targets.map(normalizeKeyword));
  const items = hot.offers
    .filter((offer) => wanted.has(normalizeKeyword(offer.sourceKeyword)))
    .map(toSnapshotItem);

  if (items.length > 0) {
    await append1688NewProductSnapshot({ source: 'extension_1688_interest_keywords', items });
  }

  return { runId: run.runId, collected: run.collected, merged: items.length, errors: run.errors };
}

/**
 * 트렌드 오퍼를 추천 표 아이템으로 옮긴다.
 *
 * ⚠️ 필드 이름을 스코어러가 **실제로 읽는 이름**에 맞춰야 한다. 트렌드 쪽 `tradeScore`
 * (문자열 등급)와 `monthlySales` 는 초기 진입 스코어러가 보지 않는다. 스코어러는
 * 숫자 `serviceScore`(평점)와 `salesNum` 을 읽으므로, 값이 숫자로 해석될 때만 그 이름으로
 * 옮긴다. 이렇게 하지 않으면 이 경로로 들어온 행은 평점과 공급 점수가 통째로 비어 버린다.
 *
 * 이 경로에는 이미지 매칭이 없어 `matchedCoupang`/마진 필드는 붙지 않는다 —
 * 스코어러가 마진 0점·경쟁 여유 중립(50점)으로 처리하므로 지어내지 않고 비워 둔다.
 */
function toSnapshotItem(offer: Hot1688OfferView) {
  const serviceScore = toFiniteNumber(offer.tradeScore);
  return {
    offerId: offer.offerId,
    keyword: offer.sourceKeyword,
    title: offer.title,
    priceCny: offer.priceCny,
    imageUrl: offer.imageUrl,
    sourceUrl: offer.sourceUrl,
    // 스코어러가 읽는 이름으로 옮긴다.
    salesNum: offer.monthlySales,
    repurchaseRate: offer.repurchaseRate,
    ...(serviceScore != null ? { serviceScore } : {}),
    supplierName: offer.supplierName,
  };
}

/** `tradeScore` 는 "4.8" 같은 문자열이거나 등급 문자열이다. 숫자일 때만 평점으로 쓴다. */
function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeKeyword(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}
