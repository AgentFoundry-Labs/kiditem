'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Info, Loader2, Save, XCircle } from 'lucide-react';
import type {
  CoupangAccountSettings,
  UpdateCoupangAccountSettings,
} from '@kiditem/shared/channel-account';
import { cn } from '@/lib/utils';

interface CoupangTabProps {
  accountSettings: CoupangAccountSettings | null;
  settingsLoading: boolean;
  isConfigured: boolean;
  savingSettings: boolean;
  onSaveSettings: (input: UpdateCoupangAccountSettings) => void;
}

export default function CoupangTab({
  accountSettings,
  settingsLoading,
  isConfigured,
  savingSettings,
  onSaveSettings,
}: CoupangTabProps) {
  const [vendorId, setVendorId] = useState('');
  const canSave = Boolean(vendorId.trim());

  useEffect(() => {
    setVendorId(accountSettings?.vendorId ?? '');
  }, [accountSettings?.vendorId, accountSettings?.updatedAt]);

  const handleSave = () => {
    if (!canSave) return;
    onSaveSettings({ vendorId: vendorId.trim() });
  };

  return (
    <>
      <div className="card p-6">
        <h2 className="font-semibold text-lg text-slate-900 mb-2">쿠팡 Wing 계정 식별자</h2>
        <p className="mb-4 text-sm text-slate-500">
          쿠팡 Open API 키는 사용하지 않습니다. 업체코드는 브라우저 수집 결과의 계정 식별과 기존 등록상품 연결에만 사용합니다.
        </p>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
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
          </div>

          <div className="grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <span className="text-[var(--text-secondary)]">저장 상태</span>
              <div className={cn('mt-1 flex items-center gap-1 font-medium', isConfigured ? 'text-green-600' : 'text-amber-600')}>
                {isConfigured ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {isConfigured ? '설정됨' : '설정 필요'}
              </div>
            </div>
            <div>
              <span className="text-[var(--text-secondary)]">현재 업체코드</span>
              <div className="mt-1 font-mono font-medium text-[var(--text-primary)]">
                {accountSettings?.vendorId || '미확인'}
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={!canSave || savingSettings}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm font-medium"
          >
            {savingSettings ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            저장
          </button>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-lg text-slate-900 mb-2">쿠팡 데이터 수집</h2>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <div className="flex items-start gap-2">
            <Info size={18} className="mt-0.5 shrink-0 text-blue-600" />
            <div className="space-y-2">
              <p className="font-medium">상품·주문 데이터는 브라우저 세션 수집만 지원합니다.</p>
              <p className="text-blue-800">
                상품은 등록상품 화면의 쿠팡 Wing 수집을, 주문은 주문수집 화면의 확장 프로그램 수집을 사용하세요. 이 화면에서는 서버 Open API 동기화를 제공하지 않습니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
