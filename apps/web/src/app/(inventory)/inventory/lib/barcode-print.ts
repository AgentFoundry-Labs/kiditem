import { formatNumber } from '@/lib/utils';
import type { InventorySkuSnapshotItem } from '@kiditem/shared/inventory';

type BarcodePrintResult = 'opened' | 'popup-blocked' | 'empty';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function pseudoBars(code: string): string {
  return code
    .split('')
    .map((character) => {
      const value = character.charCodeAt(0);
      return (value % 2 === 0 ? '█' : '▌') + (value % 3 === 0 ? '█' : '▐');
    })
    .join('');
}

export function buildBarcodePrintHtml(
  items: InventorySkuSnapshotItem[],
  today = new Date(),
): string {
  const barcodeItems = items.map((item) => {
    const code = item.barcode ?? item.sellpiaProductCode;
    const safeCode = escapeHtml(code);
    const safeSellpiaCode = escapeHtml(item.sellpiaProductCode);
    const safeName = escapeHtml(item.name);
    const safeOption = item.optionName ? escapeHtml(item.optionName) : '';
    const bars = pseudoBars(code);

    return `
      <div style="display:inline-block; width:280px; padding:20px; margin:10px; border:1px solid #ddd; text-align:center; page-break-inside:avoid; vertical-align:top;">
        <div style="font-family:'Courier New',monospace; font-size:28px; letter-spacing:1px; line-height:1; margin-bottom:6px; overflow:hidden; white-space:nowrap;">${bars}</div>
        <div style="font-family:'Courier New',monospace; font-size:13px; letter-spacing:2px; margin-bottom:4px;">${safeCode}</div>
        <div style="font-size:11px; color:#666; margin-bottom:4px;">Sellpia ${safeSellpiaCode}</div>
        <div style="font-size:12px; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:260px;">${safeName}</div>
        <div style="font-size:11px; color:#666;">${safeOption}</div>
        <div style="font-size:11px; color:#666;">현재고: ${formatNumber(item.currentStock)}개</div>
      </div>`;
  });

  const date = today.toISOString().slice(0, 10);
  return `<!DOCTYPE html>
<html><head><title>바코드 출력 - ${date}</title>
<style>
  @media print { body { margin: 0; } @page { margin: 10mm; } }
  body { font-family: -apple-system, sans-serif; padding: 20px; }
</style>
</head><body>
<h2 style="margin-bottom:20px;">Sellpia 바코드 출력 (${items.length}건)</h2>
${barcodeItems.join('')}
<script>window.onload = function() { window.print(); }</script>
</body></html>`;
}

export function printBarcodeWindow(items: InventorySkuSnapshotItem[]): BarcodePrintResult {
  if (items.length === 0) return 'empty';
  const printWindow = window.open('', '_blank');
  if (!printWindow) return 'popup-blocked';
  printWindow.document.write(buildBarcodePrintHtml(items));
  printWindow.document.close();
  return 'opened';
}
