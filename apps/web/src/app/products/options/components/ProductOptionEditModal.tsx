'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { ProductOption } from '@kiditem/shared';
import type { ProductOptionEditableFields } from '../lib/product-options-api';

interface Props {
  option: ProductOption;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSave: (patch: ProductOptionEditableFields) => void;
}

export default function ProductOptionEditModal({
  option,
  saving,
  errorMessage,
  onClose,
  onSave,
}: Props) {
  const [optionName, setOptionName] = useState(option.optionName ?? '');
  const [legacyCode, setLegacyCode] = useState(option.legacyCode ?? '');
  const [barcode, setBarcode] = useState(option.barcode ?? '');
  const [costPrice, setCostPrice] = useState<string>(
    option.costPrice == null ? '' : String(option.costPrice),
  );
  const [sellPrice, setSellPrice] = useState<string>(
    option.sellPrice == null ? '' : String(option.sellPrice),
  );
  const [isActive, setIsActive] = useState(option.isActive);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const submit = () => {
    const patch: ProductOptionEditableFields = {
      optionName: optionName.trim() === '' ? null : optionName.trim(),
      legacyCode: legacyCode.trim() === '' ? null : legacyCode.trim(),
      barcode: barcode.trim() === '' ? null : barcode.trim(),
      costPrice: costPrice === '' ? null : Number(costPrice),
      sellPrice: sellPrice === '' ? null : Number(sellPrice),
      isActive,
    };
    onSave(patch);
  };

  const barcodeInvalid =
    barcode.trim().length > 0 && !/^\d{13}$/.test(barcode.trim());
  const costPriceInvalid =
    costPrice !== '' && (!Number.isFinite(Number(costPrice)) || Number(costPrice) < 0);
  const sellPriceInvalid =
    sellPrice !== '' && (!Number.isFinite(Number(sellPrice)) || Number(sellPrice) < 0);
  const submitDisabled =
    saving || barcodeInvalid || costPriceInvalid || sellPriceInvalid;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">옵션 수정</h2>
            <p className="text-xs text-slate-500 mt-1">
              SKU <span className="font-mono">{option.sku}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            EAN / 자사상품코드는 <span className="font-semibold">MasterProduct.barcode</span> 입니다.
            여기 옵션 바코드 칸은 실제 옵션/스캐너 단위 13자리 EAN 일 때만 입력하세요.
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">옵션명</label>
            <input
              type="text"
              value={optionName}
              onChange={(e) => setOptionName(e.target.value)}
              maxLength={200}
              className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">판매자 상품코드 (legacyCode)</label>
            <input
              type="text"
              value={legacyCode}
              onChange={(e) => setLegacyCode(e.target.value)}
              maxLength={100}
              className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">옵션 바코드 (EAN-13, 옵션이면 비워두세요)</label>
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="13자리 숫자"
              className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {barcodeInvalid && (
              <p className="text-xs text-red-600 mt-1">서버 검증: 13자리 숫자여야 합니다.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">매입가 (원)</label>
              <input
                type="number"
                min={0}
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">판매가 (원)</label>
              <input
                type="number"
                min={0}
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-slate-300"
            />
            활성 (isActive)
          </label>

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorMessage}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 text-sm rounded-lg text-slate-600 hover:bg-slate-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitDisabled}
            className="px-4 py-2 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
