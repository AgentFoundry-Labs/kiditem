'use client';

import { useEffect, useState } from 'react';
import { Printer, Save } from 'lucide-react';
import { toast } from 'sonner';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';

interface PrinterConfig {
  labelPrinterType: string;
  labelSize: string;
  invoicePaperSize: string;
  autoPrint: boolean;
  copies: number;
  showBarcode: boolean;
  showPrice: boolean;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  businessNumber: string;
}

const DEFAULT_SETTINGS: PrinterConfig = {
  labelPrinterType: 'thermal',
  labelSize: '100x150',
  invoicePaperSize: 'A4',
  autoPrint: false,
  copies: 1,
  showBarcode: true,
  showPrice: false,
  companyName: '',
  companyAddress: '',
  companyPhone: '',
  businessNumber: '',
};

export default function PrinterSettings() {
  const [settings, setSettings] = useState<PrinterConfig>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = safeStorageGet('local', 'printerSettings');
      if (stored) setSettings(JSON.parse(stored) as PrinterConfig);
    } catch {
      // 저장된 설정 파싱 실패 시 기본값 사용
    }
  }, []);

  const handleSave = () => {
    try {
      if (!safeStorageSet('local', 'printerSettings', JSON.stringify(settings))) {
        throw new Error('storage unavailable');
      }
      setSaved(true);
      toast.success('프린터 설정이 저장되었습니다.');
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error('설정 저장 실패');
    }
  };

  const handleTestPrint = () => {
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) {
      toast.error('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.');
      return;
    }
    const paperWidth =
      settings.labelSize === '100x150' ? '100mm' : settings.labelSize === '100x70' ? '100mm' : '105mm';
    const paperHeight =
      settings.labelSize === '100x150' ? '150mm' : settings.labelSize === '100x70' ? '70mm' : '148mm';
    w.document.write(`
      <html><head><title>테스트 인쇄</title>
      <style>
        @page { size: ${paperWidth} ${paperHeight}; margin: 5mm; }
        body { font-family: sans-serif; margin: 0; padding: 10px; }
        .label { border: 2px solid #000; padding: 16px; }
        .title { text-align: center; font-size: 16px; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
        table { width: 100%; font-size: 12px; border-collapse: collapse; }
        td { padding: 3px 0; }
        .k { color: #666; width: 70px; }
        .v { font-weight: bold; }
      </style></head><body>
      <div class="label">
        <div class="title">배송 라벨 (테스트)</div>
        <table>
          <tr><td class="k">주문번호</td><td class="v">TEST-001</td></tr>
          <tr><td class="k">수취인</td><td class="v" style="font-size:15px;">홍길동</td></tr>
          <tr><td class="k">연락처</td><td class="v">010-1234-5678</td></tr>
          <tr><td class="k">주소</td><td style="font-size:11px;">서울특별시 강남구 테헤란로 123</td></tr>
          <tr><td colspan="2" style="border-top:1px solid #ccc;padding-top:8px;"></td></tr>
          <tr><td class="k">상품</td><td>테스트 상품명입니다</td></tr>
          <tr><td class="k">수량</td><td class="v">1개</td></tr>
          ${settings.showBarcode ? '<tr><td class="k">바코드</td><td style="font-family:monospace;">||||| 8809123456789 |||||</td></tr>' : ''}
          ${settings.showPrice ? '<tr><td class="k">금액</td><td class="v">29,900원</td></tr>' : ''}
        </table>
        ${settings.companyName ? `<div style="margin-top:12px;padding-top:8px;border-top:1px solid #ccc;font-size:10px;color:#999;text-align:center;">${settings.companyName}</div>` : ''}
      </div>
      <script>window.print();</script>
      </body></html>
    `);
    w.document.close();
  };

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <Printer size={18} className="text-slate-600" />
        <h2 className="text-sm font-semibold text-slate-900">프린터 / 인쇄 설정</h2>
      </div>

      <div className="space-y-4">
        {/* 라벨 인쇄 설정 */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">배송 라벨</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">프린터 종류</label>
              <select
                value={settings.labelPrinterType}
                onChange={(e) => setSettings({ ...settings, labelPrinterType: e.target.value })}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              >
                <option value="thermal">감열 프린터</option>
                <option value="inkjet">잉크젯</option>
                <option value="laser">레이저</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">라벨 크기</label>
              <select
                value={settings.labelSize}
                onChange={(e) => setSettings({ ...settings, labelSize: e.target.value })}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              >
                <option value="100x150">100x150mm (표준)</option>
                <option value="100x70">100x70mm (소형)</option>
                <option value="A6">A6 (105x148mm)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">인쇄 매수</label>
              <input
                type="number"
                min={1}
                max={5}
                value={settings.copies}
                onChange={(e) => setSettings({ ...settings, copies: Number(e.target.value) })}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={settings.showBarcode}
                  onChange={(e) => setSettings({ ...settings, showBarcode: e.target.checked })}
                  className="rounded"
                />
                바코드 표시
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={settings.showPrice}
                  onChange={(e) => setSettings({ ...settings, showPrice: e.target.checked })}
                  className="rounded"
                />
                가격 표시
              </label>
            </div>
          </div>
        </div>

        {/* 거래명세서 설정 */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">거래명세서 / 인보이스</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">용지 크기</label>
              <select
                value={settings.invoicePaperSize}
                onChange={(e) => setSettings({ ...settings, invoicePaperSize: e.target.value })}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              >
                <option value="A4">A4</option>
                <option value="A5">A5</option>
                <option value="Letter">Letter</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">회사명</label>
              <input
                type="text"
                value={settings.companyName}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                placeholder="주식회사 OOO"
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">사업자번호</label>
              <input
                type="text"
                value={settings.businessNumber}
                onChange={(e) => setSettings({ ...settings, businessNumber: e.target.value })}
                placeholder="000-00-00000"
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">연락처</label>
              <input
                type="text"
                value={settings.companyPhone}
                onChange={(e) => setSettings({ ...settings, companyPhone: e.target.value })}
                placeholder="02-0000-0000"
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-2">
            <label className="block text-xs text-slate-500 mb-1">회사 주소</label>
            <input
              type="text"
              value={settings.companyAddress}
              onChange={(e) => setSettings({ ...settings, companyAddress: e.target.value })}
              placeholder="서울특별시 OO구 OO로 123"
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* 자동 인쇄 */}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={settings.autoPrint}
            onChange={(e) => setSettings({ ...settings, autoPrint: e.target.checked })}
            className="rounded"
          />
          주문 발주확인 시 배송 라벨 자동 인쇄
        </label>

        {/* 저장 + 테스트 */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-800"
          >
            <Save size={14} />
            {saved ? '저장 완료!' : '설정 저장'}
          </button>
          <button
            onClick={handleTestPrint}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200"
          >
            <Printer size={14} /> 테스트 인쇄
          </button>
        </div>
      </div>
    </div>
  );
}
