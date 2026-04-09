import { formatNumber } from '@/lib/utils';
import type { InventoryItem } from '@kiditem/shared';

export function printBarcodeWindow(items: InventoryItem[]): void {
  const barcodeItems = items.map((item) => {
    const code = item.sku || item.productId;
    const bars = code
      .split('')
      .map((ch) => {
        const v = ch.charCodeAt(0);
        return (v % 2 === 0 ? '█' : '▌') + (v % 3 === 0 ? '█' : '▐');
      })
      .join('');

    return `
      <div style="display:inline-block; width:280px; padding:20px; margin:10px; border:1px solid #ddd; text-align:center; page-break-inside:avoid; vertical-align:top;">
        <div style="font-family:'Courier New',monospace; font-size:28px; letter-spacing:1px; line-height:1; margin-bottom:6px; overflow:hidden; white-space:nowrap;">${bars}</div>
        <div style="font-family:'Courier New',monospace; font-size:13px; letter-spacing:2px; margin-bottom:4px;">${code}</div>
        <div style="font-size:12px; color:#333; margin-bottom:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:260px;">${item.productName}</div>
        <div style="font-size:11px; color:#666;">재고: ${formatNumber(item.currentStock)}개</div>
      </div>`;
  });

  const html = `<!DOCTYPE html>
<html><head><title>바코드 출력 - ${new Date().toISOString().slice(0, 10)}</title>
<style>
  @media print { body { margin: 0; } @page { margin: 10mm; } }
  body { font-family: -apple-system, sans-serif; padding: 20px; }
</style>
</head><body>
<h2 style="margin-bottom:20px;">바코드 출력 (${items.length}건)</h2>
${barcodeItems.join('')}
<script>window.onload = function() { window.print(); }</script>
</body></html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
