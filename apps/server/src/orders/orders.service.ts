import { Injectable } from '@nestjs/common';
import {
  confirmOrderSheets,
  uploadInvoice,
  getOrderSheets,
  DELIVERY_COMPANIES,
} from '../coupang/orders';
import { readFile } from 'fs/promises';
import path from 'path';

@Injectable()
export class OrdersService {
  private async getOfflineOrders(status: string) {
    try {
      const filePath = path.join(process.cwd(), 'data', 'coupang_orders_raw.json');
      const raw = JSON.parse(await readFile(filePath, 'utf-8'));
      return (raw as Array<{ status: string }>).filter((o) => o.status === status);
    } catch {
      return [];
    }
  }

  async findAll(query: { from?: string; to?: string; status?: string }) {
    const from = query.from || new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const to = query.to || new Date().toISOString().slice(0, 10);
    const status = query.status || 'ACCEPT';

    let allOrders: Array<Record<string, unknown>> = [];
    let isOffline = false;

    try {
      let nextToken: string | undefined;
      do {
        const result = (await getOrderSheets({
          createdAtFrom: from,
          createdAtTo: to,
          status,
          maxPerPage: 50,
          nextToken,
        })) as { data?: Array<Record<string, unknown>>; nextToken?: string } | null;
        allOrders = allOrders.concat(result?.data ?? []);
        nextToken = result?.nextToken;
      } while (nextToken);
    } catch {
      allOrders = await this.getOfflineOrders(status);
      isOffline = true;
    }

    return {
      success: true,
      orders: allOrders,
      count: allOrders.length,
      deliveryCompanies: DELIVERY_COMPANIES,
      offline: isOffline,
    };
  }

  async confirm(shipmentBoxIds: number[]) {
    const result = await confirmOrderSheets(shipmentBoxIds);
    return { success: true, message: `${shipmentBoxIds.length}건 승인 완료`, data: result };
  }

  async uploadInvoice(shipmentBoxId: number, deliveryCompanyCode: string, invoiceNumber: string) {
    const result = await uploadInvoice(shipmentBoxId, { deliveryCompanyCode, invoiceNumber });
    return { success: true, message: '송장 전송 완료', data: result };
  }
}
