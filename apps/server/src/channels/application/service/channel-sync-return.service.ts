import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CoupangSyncReturnPayload } from './types';

export async function syncSingleCoupangReturn(
  prisma: PrismaService,
  payload: CoupangSyncReturnPayload,
  organizationId: string,
): Promise<void> {
  const receiptId = String(payload.receiptId);
  const metadata = {
    reasonCode: payload.reasonCode ?? null,
    reasonCodeText: payload.reasonCodeText ?? null,
    returnDeliveryId: payload.returnDeliveryId ?? null,
  };

  await prisma.$transaction(
    async (tx) => {
      const matchedOrder = payload.orderId
        ? await tx.order.findFirst({
            where: {
              organizationId,
              platform: 'coupang',
              externalNumber: String(payload.orderId),
            },
            select: { id: true },
          })
        : null;

      const ret = await tx.orderReturn.upsert({
        where: {
          organizationId_platform_externalReturnId: {
            organizationId,
            platform: 'coupang',
            externalReturnId: receiptId,
          },
        },
        update: {
          type: payload.receiptType ?? 'RETURN',
          status: payload.receiptStatus ?? 'pending',
          reason: payload.cancelReason ?? '',
          reasonCategory1: payload.cancelReasonCategory1 ?? null,
          reasonCategory2: payload.cancelReasonCategory2 ?? null,
          faultBy: payload.faultByType ?? 'CUSTOMER',
          requesterName: payload.requesterName ?? '',
          enclosePrice: payload.enclosePrice ?? null,
          completedAt: payload.completedAt
            ? new Date(payload.completedAt)
            : null,
          orderId: matchedOrder?.id ?? null,
          metadata: metadata as Prisma.InputJsonValue,
        },
        create: {
          organizationId,
          platform: 'coupang',
          externalReturnId: receiptId,
          type: payload.receiptType ?? 'RETURN',
          status: payload.receiptStatus ?? 'pending',
          reason: payload.cancelReason ?? '',
          reasonCategory1: payload.cancelReasonCategory1 ?? null,
          reasonCategory2: payload.cancelReasonCategory2 ?? null,
          faultBy: payload.faultByType ?? 'CUSTOMER',
          requesterName: payload.requesterName ?? '',
          enclosePrice: payload.enclosePrice ?? null,
          requestedAt: new Date(payload.requestedAt),
          completedAt: payload.completedAt
            ? new Date(payload.completedAt)
            : null,
          orderId: matchedOrder?.id ?? null,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });

      await tx.orderReturnLineItem.deleteMany({
        where: { returnId: ret.id },
      });
      const items = Array.isArray(payload.items) ? payload.items : [];
      for (const it of items) {
        await tx.orderReturnLineItem.create({
          data: {
            organizationId,
            returnId: ret.id,
            productName: it.productName ?? it.vendorItemName ?? '',
            quantity: it.quantity ?? 1,
            metadata: { raw: it } as Prisma.InputJsonValue,
          },
        });
      }
    },
    { timeout: 15_000 },
  );
}
