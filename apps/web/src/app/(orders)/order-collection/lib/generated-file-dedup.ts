import { getHistoryCollectionBucket } from './order-history-count';
import { resolveOrderCollectionMallKey } from './order-collection-malls';
import { dayKey, type ConversionHistoryItem } from './order-collection-page-model';

export function isDuplicateGeneratedFile(
  history: ConversionHistoryItem[],
  item: ConversionHistoryItem,
): boolean {
  const collectionDay = item.collectionDate ?? dayKey(item.convertedAt);
  const mallKey = resolveOrderCollectionMallKey(item);
  const signature = generatedFileSignature(item);

  return history.some(
    (existing) =>
      resolveOrderCollectionMallKey(existing) === mallKey &&
      (existing.collectionDate ?? dayKey(existing.convertedAt)) === collectionDay &&
      generatedFileSignature(existing) === signature,
  );
}

function generatedFileSignature(item: ConversionHistoryItem): string {
  const bucket = getHistoryCollectionBucket(item);
  // 중복 판정은 몰이 준 주문 신원으로, 신규 셈은 전송 기준 번호로(KID-234) — 몰 번호가 없으면 파일 번호, 그것도 없으면 행 수.
  const orderNumbers = item.capturedOrderNumbers ?? item.orderNumbers ?? [];
  if (orderNumbers.length > 0) {
    const distinct = [
      ...new Set(orderNumbers.map((value) => String(value).trim()).filter(Boolean)),
    ].sort();
    return `${bucket}|orders:${distinct.join(',')}`;
  }

  return `${bucket}|rows:${item.outputRows ?? ''}/${item.productRows ?? ''}/${item.sourceRows ?? ''}`;
}
