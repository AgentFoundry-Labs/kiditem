import { createHash } from 'node:crypto';
import type {
  CoupangDirectCenter,
  CoupangDirectOrderCollectionRequest,
  CoupangDirectPurchaseOrder,
} from '@kiditem/shared/coupang-direct-order';

export type MappedCoupangDirectOrder = ReturnType<typeof mapCoupangDirectOrder>;

export function mapCoupangDirectOrder(
  purchaseOrder: CoupangDirectPurchaseOrder,
  center: CoupangDirectCenter | undefined,
) {
  const externalOrderId = String(purchaseOrder.seq).trim();
  const lines = purchaseOrder.items.map((item) => ({
    externalLineId: stableLineId(externalOrderId, item.skuId),
    productName: item.name,
    optionName: null,
    sku: item.skuId,
    externalBarcode: item.barcode.trim() || null,
    quantity: item.qty,
    unitPrice: Math.round(item.amount / item.qty),
    totalPrice: Math.round(item.amount),
    status: 'confirmed',
    metadata: {
      provider: 'coupang_rocket',
      edd: purchaseOrder.edd,
      transport: purchaseOrder.transport,
    },
  }));
  return {
    externalOrderId,
    externalNumber: externalOrderId,
    customerName: '쿠팡 로켓',
    receiverName: purchaseOrder.center,
    receiverPhone: center?.contact ?? null,
    receiverAddr: center?.addr ?? null,
    memo: center?.zip === undefined ? null : `우편번호 ${String(center.zip)}`,
    status: 'confirmed',
    orderedAt: parseProviderDate(purchaseOrder.reg),
    totalPrice: lines.reduce((sum, line) => sum + line.totalPrice, 0),
    metadata: {
      provider: 'coupang_rocket',
      status: purchaseOrder.status,
      center: purchaseOrder.center,
      transport: purchaseOrder.transport,
      edd: purchaseOrder.edd,
      registeredAt: purchaseOrder.reg,
    },
    lines,
  };
}

export function canonicalCoupangDirectOrderHash(
  request: CoupangDirectOrderCollectionRequest,
): string {
  const canonical = {
    channelAccountId: request.channelAccountId,
    transport: request.transport,
    centers: Object.fromEntries(Object.entries(request.centers)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, center]) => [name, {
        addr: center.addr ?? null,
        zip: center.zip === undefined ? null : String(center.zip),
        contact: center.contact ?? null,
      }])),
    pos: request.pos.map((purchaseOrder) => ({
      seq: String(purchaseOrder.seq),
      status: purchaseOrder.status,
      center: purchaseOrder.center,
      transport: purchaseOrder.transport,
      edd: purchaseOrder.edd,
      reg: purchaseOrder.reg,
      items: purchaseOrder.items.map((item) => ({
        skuId: item.skuId,
        barcode: item.barcode,
        name: item.name,
        qty: item.qty,
        amount: item.amount,
      })).sort((left, right) => left.skuId.localeCompare(right.skuId)),
    })).sort((left, right) => left.seq.localeCompare(right.seq)),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function stableLineId(poNumber: string, productNo: string): string {
  const digest = createHash('sha256')
    .update(`${poNumber}\u0000${productNo}`)
    .digest('hex')
    .slice(0, 32);
  return `coupang-direct:${digest}`;
}

function parseProviderDate(value: string): Date {
  const normalized = value.trim().replace(' ', 'T');
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
    ? normalized
    : `${normalized}+09:00`;
  const parsed = new Date(zoned);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Coupang direct order registration date is invalid');
  }
  return parsed;
}
