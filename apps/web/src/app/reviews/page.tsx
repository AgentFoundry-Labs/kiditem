import Link from 'next/link';
import { ClipboardList, MessageSquareWarning, ShieldCheck, StarOff } from 'lucide-react';

const requirements = [
  'reviews/orders-feedback owner와 child PRD가 먼저 필요합니다.',
  '구현 시 GET /api/reviews는 shared Review schema와 pagination envelope를 사용해야 합니다.',
  '서버 구현은 @CurrentCompany() tenant scope와 empty-state 테스트를 포함해야 합니다.',
];

export default function ReviewsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <MessageSquareWarning size={24} aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-emerald-700">리뷰/고객 피드백 결정 게이트</p>
              <h1 className="text-2xl font-bold text-slate-900">리뷰 관리는 준비 중입니다</h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                이 화면은 아직 등록되지 않은 <code className="rounded bg-white px-1 py-0.5 text-emerald-700">/api/reviews</code> 계약을
                호출하던 legacy 화면입니다. 현재는 누락된 backend route를 호출하지 않고, 리뷰 데이터 ownership과 테스트 전략이
                확정될 때까지 명시적으로 대기합니다.
              </p>
            </div>
          </div>
          <Link
            href="/order-hub"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            주문 허브로 이동
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <ClipboardList className="mb-3 text-violet-500" size={22} aria-hidden="true" />
          <h2 className="font-semibold text-slate-900">소유권 필요</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            리뷰는 주문/고객 피드백 도메인입니다. 재고, 제품 옵션, AI 썸네일 PR과 섞어 구현하지 않습니다.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <StarOff className="mb-3 text-amber-500" size={22} aria-hidden="true" />
          <h2 className="font-semibold text-slate-900">가짜 지표 금지</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            실제 리뷰 수집/집계 경로 없이 평점, 응답 필요, 신규 리뷰 지표를 0으로 위장하지 않습니다.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <ShieldCheck className="mb-3 text-emerald-500" size={22} aria-hidden="true" />
          <h2 className="font-semibold text-slate-900">현재 안정화</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            페이지 로드와 normal navigation 모두 <code className="rounded bg-slate-100 px-1">/api/reviews</code>를 호출하지 않습니다.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">재개 조건</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
          {requirements.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
