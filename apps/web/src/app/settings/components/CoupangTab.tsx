'use client';

import { useEffect, useState } from 'react';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Package,
  ShoppingCart,
  Save,
} from 'lucide-react';
import type {
  CoupangAccountSettings,
  UpdateCoupangAccountSettings,
} from '@kiditem/shared/channel-account';
import { cn } from '@/lib/utils';
import type { SyncResult, HealthResult } from '../page';

interface CoupangTabProps {
  accountSettings: CoupangAccountSettings | null;
  settingsLoading: boolean;
  healthResult: HealthResult | null;
  isConnected: boolean;
  isConfigured: boolean;
  testing: boolean;
  savingSettings: boolean;
  syncingProduct: boolean;
  syncingOrder: boolean;
  productSyncResult: SyncResult | null;
  orderSyncResult: SyncResult | null;
  lastProductSync: Date | null;
  lastOrderSync: Date | null;
  onSaveSettings: (input: UpdateCoupangAccountSettings) => void;
  onTestConnection: () => void;
  onSyncProduct: () => void;
  onSyncOrder: () => void;
}

export default function CoupangTab({
  accountSettings,
  settingsLoading,
  healthResult,
  isConnected,
  isConfigured,
  testing,
  savingSettings,
  syncingProduct,
  syncingOrder,
  productSyncResult,
  orderSyncResult,
  lastProductSync,
  lastOrderSync,
  onSaveSettings,
  onTestConnection,
  onSyncProduct,
  onSyncOrder,
}: CoupangTabProps) {
  const [vendorId, setVendorId] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const requiresAccessKey = !accountSettings?.hasAccessKey;
  const requiresSecretKey = !accountSettings?.hasSecretKey;
  const canSave =
    Boolean(vendorId.trim()) &&
    (!requiresAccessKey || Boolean(accessKey.trim())) &&
    (!requiresSecretKey || Boolean(secretKey.trim()));

  useEffect(() => {
    setVendorId(accountSettings?.vendorId ?? '');
    setAccessKey('');
    setSecretKey('');
  }, [accountSettings?.vendorId, accountSettings?.updatedAt]);

  const handleSave = () => {
    if (!canSave) return;
    onSaveSettings({
      vendorId: vendorId.trim(),
      ...(accessKey.trim() ? { accessKey: accessKey.trim() } : {}),
      ...(secretKey.trim() ? { secretKey: secretKey.trim() } : {}),
    });
  };

  return (
    <>
      {/* 쿠팡 Wing API 연결 */}
      <div className="card p-6">
        <h2 className="font-semibold text-lg text-slate-900 mb-4">쿠팡 Wing API 연결</h2>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-[var(--text-secondary)]">업체코드 (Vendor ID)</span>
              <input
                value={vendorId}
                onChange={(event) => setVendorId(event.target.value)}
                disabled={settingsLoading || savingSettings}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
                placeholder="A00000000"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[var(--text-secondary)]">Access Key</span>
              <input
                value={accessKey}
                onChange={(event) => setAccessKey(event.target.value)}
                disabled={settingsLoading || savingSettings}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
                placeholder={
                  accountSettings?.accessKeyMasked ?? 'Access Key'
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[var(--text-secondary)]">Secret Key</span>
              <input
                type="password"
                value={secretKey}
                onChange={(event) => setSecretKey(event.target.value)}
                disabled={settingsLoading || savingSettings}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
                placeholder={accountSettings?.hasSecretKey ? '저장됨' : 'Secret Key'}
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-[var(--text-secondary)]">저장 상태</span>
              <div className={cn('mt-1 flex items-center gap-1 font-medium', isConfigured ? 'text-green-600' : 'text-amber-600')}>
                {isConfigured ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {isConfigured ? '설정됨' : '설정 필요'}
              </div>
            </div>
            <div>
              <span className="text-[var(--text-secondary)]">연결 상태</span>
              <div className="mt-1">
                {!healthResult && !testing && <span className="text-[var(--text-tertiary)]">테스트 필요</span>}
                {testing && <span className="text-purple-600 flex items-center gap-1"><Loader2 size={14} className="animate-spin" /> 테스트 중...</span>}
                {healthResult?.connected && <span className="text-green-600 flex items-center gap-1"><CheckCircle size={14} /> 연결됨</span>}
                {healthResult && !healthResult.connected && <span className="text-red-600 flex items-center gap-1"><XCircle size={14} /> 실패</span>}
              </div>
            </div>
            <div>
              <span className="text-[var(--text-secondary)]">업체코드</span>
              <div className="mt-1 font-mono font-medium text-[var(--text-primary)]">
                {accountSettings?.vendorId || '미확인'}
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

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSave}
              disabled={!canSave || savingSettings}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm font-medium"
            >
              {savingSettings ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              저장
            </button>
            <button
              onClick={onTestConnection}
              disabled={testing || !isConfigured}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
            >
              <RefreshCw size={16} className={testing ? 'animate-spin' : ''} />
              연결 테스트
            </button>
          </div>
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
              {lastProductSync && !productSyncResult && (
                <span className="text-xs text-[var(--text-tertiary)]">
                  마지막 실행 {lastProductSync.toISOString().slice(0, 16).replace('T', ' ')}
                </span>
              )}
              <button
                onClick={onSyncProduct}
                disabled={syncingProduct || !isConfigured}
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
              {lastOrderSync && !orderSyncResult && (
                <span className="text-xs text-[var(--text-tertiary)]">
                  마지막 실행 {lastOrderSync.toISOString().slice(0, 16).replace('T', ' ')}
                </span>
              )}
              <button
                onClick={onSyncOrder}
                disabled={syncingOrder || !isConfigured}
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
