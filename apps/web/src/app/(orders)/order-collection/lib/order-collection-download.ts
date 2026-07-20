import { downloadBlob } from '@/lib/browser-download';
import type { OrderCollectionConversionResult } from './order-collection-api';

export function downloadOrderCollectionFile(result: OrderCollectionConversionResult): void {
  downloadBlob(result.blob, result.fileName);
}
