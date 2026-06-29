'use client';

import { Fragment, type ReactNode } from 'react';
import { ArrowRight, Barcode, Download, FileSpreadsheet, Send, Truck } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';

interface OrderCollectionFlowProps {
  orderCount: number | null;
  productRows: number | null;
  outputRows: number | null;
  skippedRows: number | null;
}

interface FlowStage {
  key: string;
  icon: ReactNode;
  label: string;
  status: 'live' | 'soon';
  value: number | null;
  sub?: { text: string; tone?: 'danger' };
}

/**
 * 주문수집 -> 셀피아 변환 -> 셀피아 전송 -> 송장 반환 -> 몰 송장 전송 파이프라인.
 * 1~2단계(수집/변환)는 실제 동작 + 실데이터, 3~5단계는 아직 미구현이라 '연동 예정'으로 표시한다.
 */
export function OrderCollectionFlow({
  orderCount,
  productRows,
  outputRows,
  skippedRows,
}: OrderCollectionFlowProps) {
  const stages: FlowStage[] = [
    {
      key: 'collect',
      icon: <Download size={17} />,
      label: '주문 수집',
      status: 'live',
      value: orderCount,
      sub: { text: `상품 ${countText(productRows)}` },
    },
    {
      key: 'convert',
      icon: <FileSpreadsheet size={17} />,
      label: '셀피아 변환',
      status: 'live',
      value: outputRows,
      sub:
        skippedRows && skippedRows > 0
          ? { text: `제외 ${countText(skippedRows)}`, tone: 'danger' }
          : { text: '납품 양식' },
    },
    { key: 'send', icon: <Send size={17} />, label: '셀피아 전송', status: 'soon', value: null },
    { key: 'tracking', icon: <Barcode size={17} />, label: '송장 반환', status: 'soon', value: null },
    { key: 'dispatch', icon: <Truck size={17} />, label: '몰 송장 전송', status: 'soon', value: null },
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">수집 흐름</div>
        <div className="text-xs text-slate-400">셀피아 전송부터는 연동 예정</div>
      </div>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        {stages.map((stage, index) => (
          <Fragment key={stage.key}>
            <FlowNode stage={stage} />
            {index < stages.length - 1 && (
              <div className="flex items-center justify-center text-slate-300 lg:px-0.5">
                <ArrowRight size={18} className="rotate-90 lg:rotate-0" />
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function FlowNode({ stage }: { stage: FlowStage }) {
  const live = stage.status === 'live';
  return (
    <div
      className={cn(
        'flex-1 rounded-lg border px-3.5 py-3',
        live ? 'border-purple-100 bg-purple-50/50' : 'border-dashed border-slate-200 bg-slate-50/60',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 text-sm font-medium',
          live ? 'text-purple-700' : 'text-slate-400',
        )}
      >
        {stage.icon}
        <span className="truncate">{stage.label}</span>
      </div>
      {live ? (
        <>
          <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {stage.value === null ? (
              <span className="text-slate-300">-</span>
            ) : (
              <>
                {formatNumber(stage.value)}
                <span className="ml-0.5 text-sm font-normal text-slate-400">건</span>
              </>
            )}
          </div>
          {stage.sub && (
            <div
              className={cn(
                'mt-0.5 text-xs',
                stage.sub.tone === 'danger' ? 'text-red-600' : 'text-slate-500',
              )}
            >
              {stage.sub.text}
            </div>
          )}
        </>
      ) : (
        <div className="mt-2">
          <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-400">
            연동 예정
          </span>
        </div>
      )}
    </div>
  );
}

function countText(value: number | null): string {
  return value === null ? '-' : formatNumber(value);
}
