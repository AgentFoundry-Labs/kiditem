import {
  BadgePercent,
  Boxes,
  CircleDollarSign,
  Eye,
  MessageSquareText,
  PackageCheck,
  Radio,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  channelSignals,
  competitorSignals,
  type CompetitorSignal,
  type TrendSource,
} from '../lib/market-intelligence';

const signalTypeMeta: Record<CompetitorSignal['type'], { label: string; icon: typeof Boxes; className: string }> = {
  bundle: { label: '세트 구성', icon: Boxes, className: 'bg-purple-50 text-purple-700' },
  creative: { label: '콘텐츠', icon: Eye, className: 'bg-amber-50 text-amber-700' },
  price: { label: '가격', icon: CircleDollarSign, className: 'bg-emerald-50 text-emerald-700' },
  review: { label: '신뢰', icon: MessageSquareText, className: 'bg-slate-100 text-slate-700' },
};

const channelMeta: Record<TrendSource, { label: string; className: string }> = {
  NAVER: { label: 'NAVER', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  COUPANG: { label: 'COUPANG', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  WING: { label: 'WING', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  INSTAGRAM: { label: 'INSTAGRAM', className: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200' },
  DOUYIN: { label: 'DOUYIN', className: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  YOUTUBE: { label: 'YOUTUBE', className: 'bg-red-50 text-red-700 ring-red-200' },
  '1688': { label: '1688', className: 'bg-orange-50 text-orange-700 ring-orange-200' },
};

export function CompetitorSignalsSection() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        <Radio size={15} className="mt-0.5 shrink-0" />
        <p>
          아래 값은 2026-07-12 리서치 스냅샷이며 경쟁사 실시간 수집값이 아닙니다.
          실제 가격·리뷰·광고 변화 수집기가 연결되기 전에는 전략 참고 사례로만 사용하세요.
        </p>
      </div>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="경쟁사 요약">
        <SummaryCard icon={BadgePercent} label="가격 변경 사례" value="7건" detail="리서치 표본 · 평균 -6.2%" tone="purple" />
        <SummaryCard icon={MessageSquareText} label="리뷰 증가 사례" value="4개" detail="리서치 표본 · 주간 +20% 이상" tone="green" />
        <SummaryCard icon={PackageCheck} label="세트 구성 사례" value="6개" detail="리서치 표본 · 2+1 · 3개 묶음" tone="amber" />
        <SummaryCard icon={Radio} label="광고 소재 사례" value="11개" detail="리서치 표본 · ASMR 훅 5개" tone="slate" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.8fr)]">
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]" aria-labelledby="competitor-feed-title">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <p className="text-xs font-semibold text-[var(--primary)]">2026-07-12 리서치 스냅샷</p>
            <h2 id="competitor-feed-title" className="mt-1 text-lg font-bold text-[var(--text-primary)]">경쟁사 변화 피드</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">가격·리뷰·세트·콘텐츠 변화를 영향도 순으로 정렬합니다.</p>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {competitorSignals.map((signal) => {
              const meta = signalTypeMeta[signal.type];
              const Icon = meta.icon;
              return (
                <article key={signal.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', meta.className)}>
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-[var(--text-primary)]">{signal.productName}</h3>
                      <span className="text-xs text-[var(--text-tertiary)]">{signal.brand}</span>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        signal.impact === 'high' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600',
                      )}>
                        {signal.impact === 'high' ? '영향 높음' : '관찰'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-6 text-[var(--text-secondary)]">{signal.detail}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium">
                      <span className="text-[var(--primary)]">{signal.metric}</span>
                      <span className="text-[var(--text-tertiary)]">작성 당시 {signal.observedAt}</span>
                      <span className="text-[var(--text-secondary)]">{meta.label}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="rounded-xl border border-[var(--border)] bg-[var(--surface)]" aria-labelledby="creative-pattern-title">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <p className="text-xs font-semibold text-[var(--primary)]">반복되는 성공 패턴</p>
            <h2 id="creative-pattern-title" className="mt-1 text-lg font-bold text-[var(--text-primary)]">콘텐츠·상품 구성</h2>
          </div>
          <div className="space-y-3 p-5">
            <PatternCard
              icon={Volume2}
              title="촉감이 들리는 첫 1초"
              description="콰직·바삭·뿌시기 소리와 깨지는 장면을 시작 프레임에 둡니다."
              evidence="5개 상위 상품 반복"
            />
            <PatternCard
              icon={Boxes}
              title="단품보다 체감 혜택"
              description="1+1·2+1 묶음을 가격표보다 앞에 보여 선택 부담을 줄입니다."
              evidence="세트 전환율 10.9%"
            />
            <PatternCard
              icon={Sparkles}
              title="익숙한 음식 모티프"
              description="망고·비누·치즈빵처럼 결과가 예상되는 형태로 호기심을 만듭니다."
              evidence="판매 TOP 10 다수"
            />
            <PatternCard
              icon={PackageCheck}
              title="안전·배송을 한 화면에"
              description="KC·로켓배송·선물 문구를 함께 배치해 구매 직전 불안을 낮춥니다."
              evidence="상위 상세 공통"
            />
          </div>
        </aside>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]" aria-labelledby="channel-signal-title">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <p className="text-xs font-semibold text-[var(--primary)]">리서치 참고 · 실수집 아님</p>
          <h2 id="channel-signal-title" className="mt-1 text-lg font-bold text-[var(--text-primary)]">중국·SNS 선행 신호</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">과거 조사 사례를 국내 수요 검증 단계와 함께 표시합니다. 현재 선점 후보 계산에는 포함하지 않습니다.</p>
        </div>
        <div className="grid gap-px overflow-hidden rounded-b-xl bg-[var(--border)] sm:grid-cols-2 xl:grid-cols-4">
          {channelSignals.map((signal) => (
            <article key={signal.id} className="bg-[var(--surface)] p-5">
              <span className={cn('inline-flex rounded px-2 py-1 text-[10px] font-bold ring-1 ring-inset', channelMeta[signal.channel].className)}>
                {channelMeta[signal.channel].label}
              </span>
              <h3 className="mt-4 font-semibold text-[var(--text-primary)]">{signal.title}</h3>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-[var(--primary)]">{signal.value}</span>
                <span className="text-[11px] font-medium text-[var(--text-tertiary)]">{signal.change}</span>
              </div>
              <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">{signal.detail}</p>
              <div className="mt-4 border-t border-[var(--border-subtle)] pt-3 text-xs font-semibold text-[var(--text-primary)]">
                다음: {signal.action}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof BadgePercent;
  label: string;
  value: string;
  detail: string;
  tone: 'purple' | 'green' | 'amber' | 'slate';
}) {
  const toneClass = {
    purple: 'bg-purple-50 text-purple-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
  }[tone];

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--text-secondary)]">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text-primary)]">{value}</p>
        </div>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneClass)}><Icon size={18} /></span>
      </div>
      <p className="mt-2 text-xs font-medium text-[var(--text-tertiary)]">{detail}</p>
    </article>
  );
}

function PatternCard({
  icon: Icon,
  title,
  description,
  evidence,
}: {
  icon: typeof Volume2;
  title: string;
  description: string;
  evidence: string;
}) {
  return (
    <article className="rounded-lg border border-[var(--border)] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]">
          <Icon size={16} />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
            <span className="rounded bg-[var(--surface-sunken)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">{evidence}</span>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
    </article>
  );
}
