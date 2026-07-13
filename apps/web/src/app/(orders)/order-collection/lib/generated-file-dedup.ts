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
  const orderNumbers = item.orderNumbers ?? [];
  if (orderNumbers.length > 0) {
    const distinct = [
      ...new Set(orderNumbers.map((value) => String(value).trim()).filter(Boolean)),
    ].sort();
    return `${bucket}|orders:${distinct.join(',')}`;
  }

  return `${bucket}|rows:${item.outputRows ?? ''}/${item.productRows ?? ''}/${item.sourceRows ?? ''}`;
}
