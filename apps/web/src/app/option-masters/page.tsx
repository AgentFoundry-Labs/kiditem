import Link from 'next/link';
import { AlertTriangle, Boxes, ClipboardCheck, RouteOff } from 'lucide-react';

const decisionItems = [
  'legacy /api/option-masters contract는 되살리지 않습니다.',
  'ProductOption 관리가 목적이면 /api/products/options 기반 child PRD가 필요합니다.',
  '마스터 상품 분류/템플릿이 목적이면 /api/products/masters ownership을 먼저 확정해야 합니다.',
];

export default function OptionMastersPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <RouteOff size={24} aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-amber-700">제품/옵션 결정 게이트</p>
              <h1 className="text-2xl font-bold text-slate-900">옵션 마스터는 준비 중입니다</h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                이 화면은 이전 legacy API인 <code className="rounded bg-white px-1 py-0.5 text-amber-700">/api/option-masters</code>에
                의존하고 있었기 때문에 현재는 직접 조회/저장 요청을 보내지 않습니다. 제품 옵션 도메인의 정식 소유권과
                계약이 확정되면 별도 child PRD로 다시 열어야 합니다.
              </p>
            </div>
          </div>
          <Link
            href="/product-hub"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            상품 관리로 이동
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <Boxes className="mb-3 text-violet-500" size={22} aria-hidden="true" />
          <h2 className="font-semibold text-slate-900">소유 도메인</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            제품/ProductOption 도메인에서 관리합니다. 재고, 주문, 리뷰, AI 썸네일 PR과 섞지 않습니다.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <ClipboardCheck className="mb-3 text-emerald-500" size={22} aria-hidden="true" />
          <h2 className="font-semibold text-slate-900">후보 계약</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            구현 시 새 legacy endpoint가 아니라 <code className="rounded bg-slate-100 px-1">/api/products/options</code> 또는{' '}
            <code className="rounded bg-slate-100 px-1">/api/products/masters</code> 계열을 사용합니다.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <AlertTriangle className="mb-3 text-amber-500" size={22} aria-hidden="true" />
          <h2 className="font-semibold text-slate-900">현재 상태</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            준비 중 화면만 표시하며, 페이지 로드/클릭으로 <code className="rounded bg-slate-100 px-1">/api/option-masters</code>를 호출하지 않습니다.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">다음 결정 필요</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
          {decisionItems.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
