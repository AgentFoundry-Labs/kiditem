'use client';

import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Package,
  ShoppingCart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncResult, HealthResult } from '../page';

interface CoupangTabProps {
  healthResult: HealthResult | null;
  isConnected: boolean;
  testing: boolean;
  syncingProduct: boolean;
  syncingOrder: boolean;
  productSyncResult: SyncResult | null;
  orderSyncResult: SyncResult | null;
  lastProductSync: Date | null;
  lastOrderSync: Date | null;
  onTestConnection: () => void;
  onSyncProduct: () => void;
  onSyncOrder: () => void;
}

export default function CoupangTab({
  healthResult,
  isConnected,
  testing,
  syncingProduct,
  syncingOrder,
  productSyncResult,
  orderSyncResult,
  onTestConnection,
  onSyncProduct,
  onSyncOrder,
}: CoupangTabProps) {
  return (
    <>
      {/* 쿠팡 Wing API 연결 */}
      <div className="card p-6">
        <h2 className="font-semibold text-lg text-slate-900 mb-4">쿠팡 Wing API 연결</h2>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-slate-500">업체코드 (Vendor ID)</span>
              <div className={cn('font-mono font-medium mt-1', isConnected ? 'text-green-600' : 'text-slate-400')}>
                {healthResult?.vendorId || '미확인'}
              </div>
            </div>
            <div>
              <span className="text-slate-500">Access Key</span>
              <div className="font-mono font-medium mt-1 text-slate-400">
                ************************
              </div>
            </div>
            <div>
              <span className="text-slate-500">상태</span>
              <div className="mt-1">
                {!healthResult && !testing && <span className="text-slate-400">테스트 필요</span>}
                {testing && <span className="text-purple-600 flex items-center gap-1"><Loader2 size={14} className="animate-spin" /> 테스트 중...</span>}
                {healthResult?.connected && <span className="text-green-600 flex items-center gap-1"><CheckCircle size={14} /> 연결됨</span>}
                {healthResult && !healthResult.connected && <span className="text-red-600 flex items-center gap-1"><XCircle size={14} /> 실패</span>}
              </div>
            </div>
          </div>

          {healthResult && !healthResult.connected && healthResult.error && (
            <div className="text-sm p-3 rounded-lg bg-red-50 text-red-800">
              {healthResult.error}
            </div>
          )}

          {healthResult?.connected && (
            <div className="text-sm p-3 rounded-lg bg-green-50 text-green-800">
              쿠팡 API 연결 성공
            </div>
          )}

          <button
            onClick={onTestConnection}
            disabled={testing}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
          >
            <RefreshCw size={16} className={testing ? 'animate-spin' : ''} />
            연결 테스트
          </button>
        </div>
      </div>

      {/* 데이터 동기화 */}
      <div className="card p-6">
        <h2 className="font-semibold text-lg text-slate-900 mb-4">데이터 동기화</h2>
        <p className="text-sm text-slate-500 mb-4">쿠팡에서 상품/주문 데이터를 가져와 DB에 동기화합니다.</p>

        <div className="space-y-4">
          {/* 상품 동기화 */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <Package size={20} className="text-purple-600" />
              <div>
                <div className="font-medium text-sm">상품 동기화</div>
                <div className="text-xs text-slate-500">쿠팡 등록 상품 전체를 가져옵니다</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {productSyncResult && (
                <span className={cn('text-xs', productSyncResult.errors > 0 ? 'text-red-600' : 'text-green-600')}>
                  완료: {productSyncResult.synced}건 동기화{productSyncResult.errors > 0 ? `, 오류 ${productSyncResult.errors}건` : ''}
                </span>
              )}
              <button
                onClick={onSyncProduct}
                disabled={syncingProduct}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
              >
                {syncingProduct ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {syncingProduct ? '동기화 중...' : '상품 가져오기'}
              </button>
            </div>
          </div>

          {/* 주문 동기화 */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <ShoppingCart size={20} className="text-green-600" />
              <div>
                <div className="font-medium text-sm">주문 동기화</div>
                <div className="text-xs text-slate-500">최근 7일간 주문을 가져옵니다</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {orderSyncResult && (
                <span className={cn('text-xs', orderSyncResult.errors > 0 ? 'text-red-600' : 'text-green-600')}>
                  완료: {orderSyncResult.synced}건 동기화{orderSyncResult.errors > 0 ? `, 오류 ${orderSyncResult.errors}건` : ''}
                </span>
              )}
              <button
                onClick={onSyncOrder}
                disabled={syncingOrder}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                {syncingOrder ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {syncingOrder ? '동기화 중...' : '주문 가져오기'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
