'use client';

import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  Image as ImageIcon,
  ListChecks,
  Radar,
  SearchCheck,
  ShieldAlert,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import {
  actionLabels,
  pipelineStages,
  stageLabels,
  type CostConfidence,
  type KeywordStage,
  type SourcingAction,
  type SourcingDecisionRow,
} from '../lib/sourcing-ai-dashboard';

export type SourcingTab =
  | 'overview'
  | 'radar'
  | 'coupang'
  | 'criteria'
  | 'overseas'
  | 'landedCost'
  | 'decision';

export interface OverviewSummary {
  sourceNowCount: number;
  avgScore: number;
  totalNewProducts: number;
  bestLandedCost: number;
}

interface RowTabProps {
  rows: SourcingDecisionRow[];
}

interface SourceActionProps extends RowTabProps {
  onOpenSourceModal: (row: SourcingDecisionRow) => void;
}

export const sourcingTabs: Array<{ id: SourcingTab; label: string; icon: LucideIcon }> = [
  { id: 'overview', label: '오버뷰', icon: BarChart3 },
  { id: 'radar', label: '키워드 레이더', icon: Radar },
  { id: 'coupang', label: '쿠팡 시장 반응', icon: TrendingUp },
  { id: 'criteria', label: '소싱 기준', icon: SearchCheck },
  { id: 'overseas', label: '해외 상품 선택', icon: Boxes },
  { id: 'landedCost', label: '원가 계산', icon: Calculator },
  { id: 'decision', label: '최종 판단', icon: ListChecks },
];

export function OverviewTab({ rows, summary, onOpenSourceModal }: SourceActionProps & { summary: OverviewSummary }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Radar} label="자동 발견 신호" value={`+${formatNumber(summary.totalNewProducts)}`} caption="최근 신규 등록 합산" tone="sky" />
        <MetricCard icon={Target} label="소싱 후보" value={`${formatNumber(summary.sourceNowCount)}개`} caption="기준 통과 후보" tone="emerald" />
        <MetricCard icon={CircleDollarSign} label="최저 입고 원가" value={formatKRW(summary.bestLandedCost)} caption="해외 후보 기준" tone="amber" />
        <MetricCard icon={ShieldAlert} label="평균 판단 점수" value={`${formatNumber(summary.avgScore)}점`} caption="수요·반응·리스크" tone="rose" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Panel title="소싱 AI 플로우" description="쿠팡 스크래퍼가 발견하고, 사람이 해외 상품을 선택합니다.">
          <div className="grid gap-3 md:grid-cols-2">
            {pipelineStages.map((stage, index) => (
              <PipelineCard key={stage.id} index={index + 1} {...stage} />
            ))}
          </div>
        </Panel>
        <Panel title="오늘 처리할 후보" description="선택 모달에서 해외 상품을 확정합니다.">
          <div className="space-y-2">
            {rows.map((row) => (
              <CandidateRow key={row.id} row={row} onOpenSourceModal={onOpenSourceModal} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function KeywordRadarTab({ rows }: RowTabProps) {
  return (
    <Panel title="키워드 레이더" description="쿠팡 카테고리와 상품명에서 자동 발견된 키워드입니다.">
      <ResponsiveTable minWidth="1080px">
        <thead>
          <tr>
            <th>키워드</th>
            <th>상품군</th>
            <th>쿠팡 결과</th>
            <th>최근 등록</th>
            <th>평균가</th>
            <th>가격 안정성</th>
            <th>수집 기준</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><KeywordCell row={row} /></td>
              <td>{row.category}</td>
              <td>{formatNumber(row.demand.registeredProducts)}개</td>
              <td><PositiveDelta value={row.demand.newProductDelta} /></td>
              <td>{formatKRW(row.demand.avgSalePrice)}</td>
              <td><ScoreBar value={row.demand.priceStability} /></td>
              <td className="text-xs font-bold text-[var(--text-tertiary)]">{row.demand.freshness}</td>
              <td><StageBadge stage={row.stage} /></td>
            </tr>
          ))}
        </tbody>
      </ResponsiveTable>
    </Panel>
  );
}

export function CoupangMarketTab({ rows }: RowTabProps) {
  return (
    <Panel title="쿠팡 시장 반응" description="신규 등록, 리뷰 증가, 랭킹 변화를 같이 봅니다.">
      <ResponsiveTable minWidth="1040px">
        <thead>
          <tr>
            <th>키워드</th>
            <th>시장 신호</th>
            <th>리뷰 증가</th>
            <th>랭킹 변화</th>
            <th>경쟁도</th>
            <th>판정</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><KeywordCell row={row} /></td>
              <td className="max-w-[380px] text-sm font-semibold text-[var(--text-secondary)]">{row.demand.signal}</td>
              <td><PositiveDelta value={row.demand.reviewDelta} /></td>
              <td className={cn('font-black', row.demand.rankMovement > 0 ? 'text-emerald-700' : 'text-rose-700')}>
                {row.demand.rankMovement > 0 ? '+' : ''}{row.demand.rankMovement}
              </td>
              <td>{formatNumber(row.demand.competitionScore)}점</td>
              <td>{row.demand.reviewDelta >= row.demand.newProductDelta ? '시장 반응 확인' : '등록 과열 주의'}</td>
            </tr>
          ))}
        </tbody>
      </ResponsiveTable>
    </Panel>
  );
}

export function SourcingCriteriaTab({ rows }: RowTabProps) {
  return (
    <Panel title="소싱 기준" description="기준을 넘은 키워드만 해외 상품 선택 단계로 보냅니다.">
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <article key={row.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
            <div className="flex items-start justify-between gap-3">
              <KeywordCell row={row} />
              <ScorePill score={row.score} />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              <MiniMetric label="수요" value={`${Math.min(35, Math.round(row.demand.searchVolume / 600))}/35`} />
              <MiniMetric label="반응" value={`${Math.min(25, row.demand.reviewDelta)}/25`} />
              <MiniMetric label="경쟁" value={`${Math.max(0, 20 - Math.round(row.demand.competitionScore / 5))}/20`} />
              <MiniMetric label="리스크" value={`${Math.max(0, 20 - row.risks.length * 5)}/20`} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {row.risks.map((risk) => <RiskTag key={risk} text={risk} />)}
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

export function OverseasSourceTab({ rows, onOpenSourceModal }: SourceActionProps) {
  return (
    <Panel title="해외 상품 선택" description="1688/타오바오 후보는 모달에서 비교 후 하나를 선택합니다.">
      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {rows.map((row) => (
          <article key={row.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
            <div className="flex gap-3">
              <SourceImage row={row} />
              <div className="min-w-0 flex-1">
                <KeywordCell row={row} />
                <p className="mt-2 text-xs font-semibold text-[var(--text-secondary)]">
                  후보 {row.sourceCandidates.length}개 · 추천 {row.source.platform}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniMetric label="추천 원가" value={`${row.source.priceCny.toFixed(1)} CNY`} />
                  <MiniMetric label="입고 원가" value={formatKRW(row.source.landedCostKrw)} />
                  <MiniMetric label="MOQ" value={`${formatNumber(row.source.moq)}개`} />
                  <MiniMetric label="공급사" value={row.source.supplierGrade} />
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenSourceModal(row)}
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] text-xs font-black text-[var(--primary-contrast)] transition hover:bg-[var(--primary-hover)]"
            >
              <ExternalLink size={14} />
              후보 비교하기
            </button>
          </article>
        ))}
      </div>
    </Panel>
  );
}

export function LandedCostTab({ rows, onOpenSourceModal }: SourceActionProps) {
  return (
    <Panel title="원가 계산" description="판매가와 마진은 제외하고 한국 입고 원가만 계산합니다.">
      <ResponsiveTable minWidth="1100px">
        <thead>
          <tr>
            <th>키워드</th>
            <th>해외 후보</th>
            <th>상품 단가</th>
            <th>중국 배송</th>
            <th>국제 배송</th>
            <th>관부가세 추정</th>
            <th>한국 입고 원가</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><KeywordCell row={row} /></td>
              <td>
                <button type="button" onClick={() => onOpenSourceModal(row)} className="text-left text-sm font-black text-[var(--primary)]">
                  {row.source.platform} 후보 보기
                </button>
              </td>
              <td>{row.source.priceCny.toFixed(1)} CNY</td>
              <td>{row.source.chinaShippingCny.toFixed(1)} CNY</td>
              <td>{formatKRW(row.source.internationalShippingKrw)}</td>
              <td>{formatKRW(row.source.taxEstimateKrw)}</td>
              <td className="font-black text-[var(--text-primary)]">{formatKRW(row.source.landedCostKrw)}</td>
              <td><CostConfidenceBadge value={row.source.costConfidence} /></td>
            </tr>
          ))}
        </tbody>
      </ResponsiveTable>
    </Panel>
  );
}

export function FinalDecisionTab({ rows, onOpenSourceModal }: SourceActionProps) {
  return (
    <Panel title="최종 판단" description="선택된 해외 상품과 리스크를 기준으로 실행합니다.">
      <ResponsiveTable minWidth="980px">
        <thead>
          <tr>
            <th>키워드</th>
            <th>점수</th>
            <th>선택 상품</th>
            <th>리스크</th>
            <th>액션</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><KeywordCell row={row} /></td>
              <td><ScorePill score={row.score} /></td>
              <td>
                <button type="button" onClick={() => onOpenSourceModal(row)} className="text-left text-sm font-black text-[var(--primary)]">
                  {row.source.title}
                </button>
              </td>
              <td><div className="flex flex-wrap gap-1.5">{row.risks.map((risk) => <RiskTag key={risk} text={risk} />)}</div></td>
              <td><ActionBadge action={row.action} /></td>
            </tr>
          ))}
        </tbody>
      </ResponsiveTable>
    </Panel>
  );
}

function CandidateRow({ row, onOpenSourceModal }: { row: SourcingDecisionRow; onOpenSourceModal: (row: SourcingDecisionRow) => void }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><StageBadge stage={row.stage} /><span className="truncate text-xs font-bold text-[var(--text-tertiary)]">{row.demand.freshness}</span></div>
          <p className="mt-1 truncate text-sm font-black text-[var(--text-primary)]">{row.keyword}</p>
        </div>
        <ScorePill score={row.score} />
      </div>
      <button type="button" onClick={() => onOpenSourceModal(row)} className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs font-black text-[var(--text-primary)] transition hover:border-[var(--primary)]">
        <ArrowUpRight size={13} />
        해외 후보 선택
      </button>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border-subtle)] px-4 py-4">
        <h2 className="text-sm font-black text-[var(--text-primary)]">{title}</h2>
        <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">{description}</p>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ResponsiveTable({ minWidth, children }: { minWidth: string; children: ReactNode }) {
  return <div className="overflow-x-auto"><table style={{ minWidth }} className="w-full">{children}</table></div>;
}

function SourceImage({ row }: { row: SourcingDecisionRow }) {
  return (
    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <img src={row.source.imageUrl} alt="" className="h-full w-full object-cover" />
      <span className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-black text-white">
        <ImageIcon size={10} />
        {row.source.imageCount}
      </span>
    </div>
  );
}

function KeywordCell({ row }: { row: SourcingDecisionRow }) {
  return <div className="min-w-0"><p className="text-sm font-black text-[var(--text-primary)]">{row.keyword}</p><p className="mt-1 text-xs font-bold text-[var(--text-tertiary)]">{row.category}</p></div>;
}

function MetricCard({ icon: Icon, label, value, caption, tone }: { icon: LucideIcon; label: string; value: string; caption: string; tone: 'sky' | 'emerald' | 'amber' | 'rose' }) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-bold text-[var(--text-tertiary)]">{label}</p><p className="mt-2 text-2xl font-black text-[var(--text-primary)]">{value}</p><p className="mt-1 text-xs font-semibold text-[var(--text-muted)]">{caption}</p></div>
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone === 'sky' && 'bg-sky-100 text-sky-700', tone === 'emerald' && 'bg-emerald-100 text-emerald-700', tone === 'amber' && 'bg-amber-100 text-amber-700', tone === 'rose' && 'bg-rose-100 text-rose-700')}><Icon size={18} /></span>
      </div>
    </article>
  );
}

function PipelineCard({ index, title, metric, description }: { index: number; title: string; metric: string; description: string }) {
  return (
    <article className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
      <div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--primary)] text-xs font-black text-[var(--primary-contrast)]">{index}</span><h3 className="text-sm font-black text-[var(--text-primary)]">{title}</h3></div>
      <p className="mt-2 text-xs font-black text-[var(--primary)]">{metric}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">{description}</p>
    </article>
  );
}

function StageBadge({ stage }: { stage: KeywordStage }) {
  return <span className={cn('rounded-md px-2 py-1 text-xs font-black', stage === 'rising' && 'bg-emerald-100 text-emerald-700', stage === 'watch' && 'bg-sky-100 text-sky-700', stage === 'crowded' && 'bg-amber-100 text-amber-700', stage === 'blocked' && 'bg-rose-100 text-rose-700')}>{stageLabels[stage]}</span>;
}

function ActionBadge({ action }: { action: SourcingAction }) {
  return <span className={cn('rounded-md px-2 py-1 text-xs font-black', action === 'source_now' && 'bg-emerald-100 text-emerald-700', action === 'track' && 'bg-sky-100 text-sky-700', action === 'hold' && 'bg-amber-100 text-amber-700', action === 'drop' && 'bg-rose-100 text-rose-700')}>{actionLabels[action]}</span>;
}

function CostConfidenceBadge({ value }: { value: CostConfidence }) {
  const labels: Record<CostConfidence, string> = { confirmed: '확정', estimated: '추정', missing: '누락' };
  return <span className={cn('rounded-md px-2 py-1 text-xs font-black', value === 'confirmed' && 'bg-emerald-100 text-emerald-700', value === 'estimated' && 'bg-amber-100 text-amber-700', value === 'missing' && 'bg-rose-100 text-rose-700')}>{labels[value]}</span>;
}

function ScorePill({ score }: { score: number }) {
  return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-raised)] text-sm font-black text-[var(--primary)] ring-1 ring-[var(--border)]">{score}</span>;
}

function ScoreBar({ value }: { value: number }) {
  return <div className="flex items-center gap-2"><div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--surface-sunken)]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${value}%` }} /></div><span className="text-xs font-black text-[var(--text-secondary)]">{value}</span></div>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1.5"><p className="text-[10px] font-bold text-[var(--text-muted)]">{label}</p><p className="mt-0.5 truncate text-xs font-black text-[var(--text-primary)]">{value}</p></div>;
}

function RiskTag({ text }: { text: string }) {
  return <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-bold text-[var(--text-secondary)]"><CheckCircle2 size={11} />{text}</span>;
}

function PositiveDelta({ value }: { value: number }) {
  return <span className="text-sm font-black text-emerald-700">+{formatNumber(value)}</span>;
}
