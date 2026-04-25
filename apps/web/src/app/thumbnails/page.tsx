import Link from 'next/link';
import { Bot, ImageOff, RouteOff, ShieldCheck } from 'lucide-react';

const requirements = [
  'AI thumbnail owner와 child PRD가 먼저 필요합니다.',
  'thumbnail-analysis/generation/tracking endpoint 계약과 shared schema를 확정해야 합니다.',
  'LLM 호출은 web page가 직접 수행하지 않고 기존 agent/task boundary를 통해 실행해야 합니다.',
  '@CurrentCompany() company scope, empty-state, async job lifecycle 테스트가 필요합니다.',
];

export default function ThumbnailsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <section className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/80 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-100 text-fuchsia-700">
              <RouteOff size={24} aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-fuchsia-700">AI 썸네일 결정 게이트</p>
              <h1 className="text-2xl font-bold text-slate-900">썸네일 AI는 준비 중입니다</h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                이 화면은 아직 등록되지 않은 <code className="rounded bg-white px-1 py-0.5 text-fuchsia-700">/api/thumbnail-analysis*</code> 및
                <code className="ml-1 rounded bg-white px-1 py-0.5 text-fuchsia-700">/api/thumbnail-tracking</code> 계약에 의존하던 legacy 대시보드입니다.
                현재는 누락된 backend route나 AI workflow를 호출하지 않고, 정식 PRD와 실행 경계가 확정될 때까지 명시적으로 대기합니다.
              </p>
            </div>
          </div>
          <Link
            href="/image-hub"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            이미지 허브로 이동
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <ImageOff className="mb-3 text-violet-500" size={22} aria-hidden="true" />
          <h2 className="font-semibold text-slate-900">가짜 백엔드 금지</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            임시 성공 응답이나 빈 generation 목록으로 AI 썸네일 기능을 위장하지 않습니다.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <Bot className="mb-3 text-fuchsia-500" size={22} aria-hidden="true" />
          <h2 className="font-semibold text-slate-900">Agent boundary 필요</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            향후 생성/분석 작업은 frontend 직접 LLM 호출이 아니라 agent/task 실행 경계를 통해 추적되어야 합니다.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <ShieldCheck className="mb-3 text-emerald-500" size={22} aria-hidden="true" />
          <h2 className="font-semibold text-slate-900">현재 안정화</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            페이지 로드와 normal navigation 모두 thumbnail-analysis 또는 thumbnail-tracking API를 호출하지 않습니다.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">재개 조건</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
          {requirements.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-fuchsia-500" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
