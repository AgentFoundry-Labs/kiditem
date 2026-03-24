import { Injectable } from '@nestjs/common';
import { getReturnRequests, approveReturn, getExchangeRequests } from '../coupang/orders';
import { readFile } from 'fs/promises';
import path from 'path';

@Injectable()
export class ReturnsService {
  private async getOfflineReturns() {
    try {
      const filePath = path.join(process.cwd(), 'data', 'coupang_returns_all.json');
      return JSON.parse(await readFile(filePath, 'utf-8')) as Array<Record<string, unknown>>;
    } catch {
      return [];
    }
  }

  private async getOfflineExchanges() {
    try {
      const filePath = path.join(process.cwd(), 'data', 'coupang_exchanges.json');
      return JSON.parse(await readFile(filePath, 'utf-8')) as Array<Record<string, unknown>>;
    } catch {
      return [];
    }
  }

  async findAll(query: { from?: string; to?: string; type?: string }) {
    const from = query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = query.to || new Date().toISOString().slice(0, 10);
    const type = query.type || 'return';
    let isOffline = false;

    if (type === 'exchange') {
      let data: Array<Record<string, unknown>> = [];
      try {
        const result = (await getExchangeRequests({ createdAtFrom: from, createdAtTo: to })) as { data?: Array<Record<string, unknown>> } | null;
        data = result?.data ?? [];
      } catch {
        data = await this.getOfflineExchanges();
        isOffline = true;
      }
      return { success: true, data, count: data.length, type: 'exchange', offline: isOffline };
    }

    let allReturns: Array<Record<string, unknown>> = [];
    try {
      for (const status of ['UC', 'RC']) {
        try {
          const result = (await getReturnRequests({ createdAtFrom: from, createdAtTo: to, status })) as { data?: Array<Record<string, unknown>> } | null;
          allReturns = allReturns.concat(result?.data ?? []);
        } catch { /* skip */ }
      }
      if (allReturns.length === 0) {
        allReturns = await this.getOfflineReturns();
        isOffline = true;
      }
    } catch {
      allReturns = await this.getOfflineReturns();
      isOffline = true;
    }

    return { success: true, data: allReturns, count: allReturns.length, type: 'return', offline: isOffline };
  }

  async approve(receiptId: number) {
    const result = await approveReturn(receiptId);
    return { success: true, message: '반품 승인 완료', data: result };
  }
}
