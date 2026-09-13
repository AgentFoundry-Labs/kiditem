import { Fragment, type ReactNode } from 'react';
import {
  type DashboardMetricBasis,
  type DashboardMetricBasisMap,
  type DashboardPeriodBasis,
  type DashboardSnapshotBasis,
  type DashboardSnapshotBasisStatus,
  periodBasisMissingDates,
  periodBasisStatus,
  snapshotBasisPartial,
  snapshotBasisStatus,
} from '@kiditem/shared/dashboard';
import { cn } from '@/lib/utils';
import { shiftBusinessDateKey } from '@kiditem/shared/common';
import { InfoDisclosure, type DisclosureTone } from '@/components/ui/InfoDisclosure';

export type {
  DashboardMetricBasis,
  DashboardPeriodBasis,
  DashboardSnapshotBasis,
};

/** Any dashboard summary that may publish an additive basis map. */
export type MetricBasisCarrier = { metricBasis?: DashboardMetricBasisMap } | null | undefined;

/**
 * The source vocabulary in the words an operator uses.
 *
 * `sources` arrives as the server's own names — `orders`, `wing_traffic` — and
 * the panel used to print them exactly like that, so the ⓘ read as a variable
 * dump rather than an account of where a number came from. The names are the
 * server's stable vocabulary and should stay that way on the wire; this is the
 * one place they become Korean — for the ⓘ and for a panel header that names
 * an effective period's source.
 */
const SOURCE_LABELS: Record<string, string> = {
  orders: '주문',
  profit: '순이익 계산',
  sellpia: '셀피아',
  sellpia_sales: '셀피아 판매현황',
  sellpia_inventory: '셀피아 재고',
  coupang_ads: '쿠팡 광고',
  wing: 'Wing',
  wing_traffic: 'Wing 트래픽',
  // An effective period fed by more than one of the lanes above.
  mixed: '혼합',
  products: '상품',
  product_abc: 'ABC 등급',
  channel_listings: '채널 리스팅',
  alerts: '알림',
};

/** Which collection fills a source, so the ⓘ can end in something to do. */
const SOURCE_COLLECTION: Record<string, string> = {
  orders: '몰 주문수집',
  sellpia_sales: '셀피아 동기화',
  sellpia_inventory: '셀피아 동기화',
  coupang_ads: '쿠팡 광고 수집',
  wing_traffic: 'Wing 일별 트래픽',
};

/**
 * The operator's word for one source, or null when the vocabulary has none.
 *
 * A header must never print the server's own name, so on null it leaves its
 * segment out; the ⓘ tables below fall back to the name rather than drop a row.
 */
export function dashboardSourceLabel(source: string): string | null {
  return SOURCE_LABELS[source] ?? null;
}

function sourceLabel(source: string): string {
  return dashboardSourceLabel(source) ?? source;
}

/** Read the basis published under one stable dotted path, or null. */
export function readMetricBasis(value: MetricBasisCarrier, key: string): DashboardMetricBasis | null {
  return value?.metricBasis?.[key] ?? null;
}

/** Read the first basis published under one of the stable dotted paths. */
export function readFirstMetricBasis(
  value: MetricBasisCarrier,
  keys: readonly string[],
): DashboardMetricBasis | null {
  for (const key of keys) {
    const basis = readMetricBasis(value, key);
    if (basis) return basis;
  }
  return null;
}

export function basisHasValues(basis: DashboardMetricBasis | null): boolean {
  if (!basis) return false;
  if (basis.kind === 'period') {
    return basis.includedDates.length > 0 || periodBasisStatus(basis) === 'unverified';
  }
  // An unknown or stale snapshot is still a real snapshot. Keep its numeric
  // value visible and make the uncertainty explicit in the status label
  // instead of silently turning it into an empty card.
  return basis.measured;
}

function dateCount(basis: DashboardPeriodBasis): number {
  return basis.includedDates.length;
}

function rangeText(basis: DashboardPeriodBasis): string {
  return `${basis.from} ~ ${basis.to}`;
}

function dateListText(dates: string[]): string {
  return dates.join(', ');
}

function sourceText(sources: string[]): string {
  return sources.length > 0 ? sources.map(sourceLabel).join(' · ') : '원천 미상';
}

/**
 * Dates as a person would say them: runs collapse into a span, and a long list
 * stops naming days and states how many there are.
 *
 * Thirty ISO dates separated by commas is the data, not the answer. A reader
 * opening the ⓘ wants to know whether a few days are missing or the whole
 * month is.
 */
function dateSpansText(dates: readonly string[], targetDays: number): string {
  if (dates.length === 0) return '없음';
  if (targetDays > 0 && dates.length === targetDays) return `${targetDays}일 전체`;
  const dayAfter = (date: string) => shiftBusinessDateKey(date, 1);
  // A run of two reads better as two dates than as a range, so only three or
  // more collapse. Below that a span costs a reader a subtraction and saves
  // nothing.
  const runs: string[][] = [];
  for (const date of dates) {
    const last = runs.at(-1);
    if (last && date === dayAfter(last.at(-1)!)) last.push(date);
    else runs.push([date]);
  }
  const spans = runs.flatMap((run) =>
    run.length >= 3 ? [`${run[0]} ~ ${run.at(-1)}`] : run);
  // Past a handful of spans the list stops informing and starts scrolling.
  if (spans.length > 4) return `${dates.length}일 · ${spans.slice(0, 3).join(', ')} 외 ${spans.length - 3}구간`;
  return `${dates.length}일 · ${spans.join(', ')}`;
}

/**
 * One sentence saying how this number came to be, before any table.
 *
 * This is the part a reader actually needs: whether the value is a measurement,
 * what it covers, and — when it is not — which collection would fix it.
 */
function howItWasMeasured(basis: DashboardPeriodBasis): string {
  const days = dateCount(basis);
  const sources = basis.sources.map(sourceLabel).join(' · ') || '원천 미상';
  if (days === 0) {
    const collection = basis.sources.map((source) => SOURCE_COLLECTION[source]).find(Boolean);
    return collection
      ? `${sources}에서 이 기간에 수집된 날이 없어 값을 내지 않았습니다. ${collection}을 실행하면 채워집니다.`
      : `${sources}에서 이 기간에 수집된 날이 없어 값을 내지 않았습니다.`;
  }
  if (days === basis.targetDays) {
    return `${rangeText(basis)} ${basis.targetDays}일을 모두 ${sources}에서 읽어 합산했습니다.`;
  }
  return `${rangeText(basis)} 중 수집된 ${days}일만 ${sources}에서 읽어 합산했습니다. `
    + `나머지 ${basis.targetDays - days}일은 빠져 있으므로 기간 전체의 합이 아닙니다.`;
}

function queryFailureText(basis: DashboardMetricBasis): string | null {
  if (basis.kind !== 'period') return null;
  const queryFailedSources = basis.queryFailedSources ?? [];
  if (queryFailedSources.length === 0) return null;
  return `조회 실패 · ${queryFailedSources.map((source) => sourceLabel(source)).join(' · ')}`;
}

function snapshotStatusText(status: DashboardSnapshotBasisStatus): string {
  if (status === 'current') return '현재';
  if (status === 'stale') return '오래됨';
  if (status === 'unavailable') return '사용 불가';
  return '상태 미상';
}

/**
 * A snapshot's age and its population coverage are separate facts, so this
 * reads beside the status rather than replacing it: a count read today can be
 * current and still have left members out. The number is what makes "partial"
 * mean something — the snapshot counterpart of a period's missing dates.
 *
 * A withheld population that is not partial is one whose every member was
 * withheld, which is why the value is unavailable — so the same number reads
 * as the reason the card is blank rather than as a qualifier on a number.
 */
function snapshotCoverageText(basis: DashboardSnapshotBasis): string | null {
  if (basis.withheldCount === 0) return null;
  return snapshotBasisPartial(basis)
    ? `부분 집계 · 근거 부족 ${basis.withheldCount}건 제외`
    : `근거 부족 ${basis.withheldCount}건`;
}

function periodEvidenceText(basis: DashboardPeriodBasis): string {
  const status = periodBasisStatus(basis);
  const evidence = `${status === 'complete' ? '집계 완료' : status === 'partial' ? '부분 집계' : status === 'unverified' ? '날짜 근거 확인 필요' : '데이터 없음'} · ${dateCount(basis)}/${basis.targetDays}일 · ${rangeText(basis)}`;
  const failure = queryFailureText(basis);
  return failure ? `${evidence} · ${failure}` : evidence;
}

export function basisSummary(basis: DashboardMetricBasis | null): string {
  if (!basis) return '근거 정보 없음';
  if (basis.kind === 'snapshot') {
    const asOf = basis.asOf ?? '기준 시점 확인 불가';
    const coverage = snapshotCoverageText(basis);
    return `스냅샷 ${snapshotStatusText(snapshotBasisStatus(basis))}${coverage ? ` · ${coverage}` : ''} · 기준시점 ${asOf} · ${sourceText(basis.sources)}`;
  }
  return periodEvidenceText(basis);
}

/**
 * The short summary stays beside the number it explains. The enumerated dates
 * behind it do not: those lists grow with the selected range and were crowding
 * the cards. They are reached through the section's one help affordance, which
 * breaks the evidence down per value — see `DashboardBasisDisclosure`.
 */
export function DashboardDataBasis({
  basis,
  className,
}: {
  basis: DashboardMetricBasis | null;
  className?: string;
}) {
  if (!basis) return null;

  if (basis.kind === 'snapshot') {
    return (
      <div className={cn('text-xs text-slate-400', className)} data-testid="dashboard-data-basis">
        {basisSummary(basis)}
        {basis.observedAt && <span className="ml-1">· 관측 {String(basis.observedAt)}</span>}
      </div>
    );
  }

  return (
    <span
      className={cn('inline-flex items-start gap-1 text-xs text-slate-400', className)}
      data-testid="dashboard-data-basis"
    >
      <span>{basisSummary(basis)}</span>
    </span>
  );
}

/** One displayed value and the evidence published for it. */
export type BasisBreakdownEntry = {
  /** The value this row explains, in the words the card uses. */
  label: string;
  basis?: DashboardMetricBasis | null;
};

type PeriodRow = {
  key: string;
  label: string;
  /** One sentence saying how this value came to be, ahead of the table. */
  how: string;
  range: string;
  days: string;
  includedDates: string;
  missing: string;
  sources: string;
  note: string | null;
};

type SnapshotRow = {
  key: string;
  label: string;
  asOf: string;
  sources: string;
  note: string | null;
};

function joinNotes(parts: ReadonlyArray<string | null>): string | null {
  const notes = parts.filter((part): part is string => part !== null && part !== '');
  return notes.length > 0 ? notes.join(' · ') : null;
}


function periodRow(
  key: string,
  label: string,
  basis: DashboardPeriodBasis,
  extraNote: string | null = null,
): PeriodRow {
  const invalid = basis.invalidDates ?? [];
  return {
    key,
    label,
    range: rangeText(basis),
    days: `${dateCount(basis)}/${basis.targetDays}일`,
    includedDates: dateSpansText(basis.includedDates, basis.targetDays),
    missing: dateSpansText(periodBasisMissingDates(basis), basis.targetDays),
    sources: sourceText(basis.sources),
    how: howItWasMeasured(basis),
    note: joinNotes([
      extraNote,
      queryFailureText(basis),
      invalid.length > 0 ? `제외 날짜 ${dateListText(invalid)}` : null,
    ]),
  };
}

function snapshotRow(key: string, label: string, basis: DashboardSnapshotBasis): SnapshotRow {
  return {
    key,
    label,
    asOf: basis.asOf ?? '기준 시점 확인 불가',
    sources: sourceText(basis.sources),
    note: joinNotes([
      snapshotStatusText(snapshotBasisStatus(basis)),
      snapshotCoverageText(basis),
      basis.observedAt ? `관측 ${String(basis.observedAt)}` : null,
    ]),
  };
}

/**
 * Split the published evidence into the two shapes it actually has. Period and
 * snapshot bases answer different questions — included/missing dates versus an
 * as-of — so they are never merged into one table with empty cells.
 */
function splitBreakdown(entries: readonly BasisBreakdownEntry[]): {
  periodRows: PeriodRow[];
  snapshotRows: SnapshotRow[];
} {
  const periodRows: PeriodRow[] = [];
  const snapshotRows: SnapshotRow[] = [];

  entries.forEach((entry, index) => {
    const key = `${index}-${entry.label}`;
    const basis = entry.basis ?? null;
    if (basis?.kind === 'period') {
      periodRows.push(periodRow(key, entry.label, basis));
    } else if (basis?.kind === 'snapshot') {
      snapshotRows.push(snapshotRow(key, entry.label, basis));
    }
  });

  return { periodRows, snapshotRows };
}

/**
 * A fact is common only when every row agrees on it. Anything else stays in
 * its own row: a single sentence covering values whose bases differ is the
 * ambiguity the per-value basis contract exists to prevent.
 */
function sharedFact<Row>(rows: readonly Row[], read: (row: Row) => string): string | null {
  if (rows.length < 2) return null;
  const first = read(rows[0]);
  return rows.every((row) => read(row) === first) ? first : null;
}

function SharedFacts({ facts }: { facts: ReadonlyArray<[string, string | null]> }) {
  const present = facts.filter((fact): fact is [string, string] => fact[1] !== null);
  if (present.length === 0) return null;
  return (
    <p className="mb-1.5 text-[var(--text-secondary)]">
      {present.map(([label, value]) => `${label} ${value}`).join(' · ')} <span className="text-[var(--text-muted)]">(모든 값 공통)</span>
    </p>
  );
}

// The app's base table styles uppercase every `th` and hold every `td` on one
// line. Both are wrong for an evidence table: they mangle mixed-script labels
// and would push a month of dates 3,000px to the right.
const CELL = 'py-1 pr-3 align-top text-xs normal-case tracking-normal whitespace-normal';
const HEAD = cn(CELL, 'text-left font-semibold');

/** A date list is bounded here so the column wraps instead of growing. */
function Dates({ children }: { children: ReactNode }) {
  return <div className="max-w-[15rem]">{children}</div>;
}

function NoteRow({ note, columnCount }: { note: string; columnCount: number }) {
  return (
    <tr>
      <td colSpan={columnCount} className={cn(CELL, 'pb-1.5 pl-2 text-[var(--text-muted)]')}>{note}</td>
    </tr>
  );
}

function PeriodBreakdownTable({ rows }: { rows: readonly PeriodRow[] }) {
  const sharedRange = sharedFact(rows, (row) => row.range);
  const sharedSources = sharedFact(rows, (row) => row.sources);
  const columnCount = 3 + (sharedRange ? 0 : 1) + (sharedSources ? 0 : 1);

  return (
    <section>
      <h4 className="font-semibold text-[var(--text-primary)]">이 값이 나온 방법</h4>
      <p className="mb-1 text-[var(--text-muted)]">값마다 실제 집계 기간과 원천이 다릅니다.</p>
      {/* The sentence comes first because it is the answer. The table under it
          is the working — which days, which sources — for a reader who wants to
          check it rather than be told it. */}
      <ul className="mb-2 space-y-1">
        {rows.map((row) => (
          <li key={`how-${row.key}`} className="leading-snug">
            <span className="font-medium text-[var(--text-primary)]">{row.label}</span>
            <span className="text-[var(--text-muted)]"> — {row.how}</span>
          </li>
        ))}
      </ul>
      <h5 className="mt-2 font-semibold text-[var(--text-primary)]">집계에 쓰인 날짜</h5>
      <SharedFacts facts={[['기간', sharedRange], ['원천', sharedSources]]} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
              <th scope="col" className={HEAD}>값</th>
              {!sharedRange && <th scope="col" className={HEAD}>기간</th>}
              <th scope="col" className={HEAD}>포함 일수</th>
              <th scope="col" className={HEAD}>누락</th>
              {!sharedSources && <th scope="col" className={HEAD}>원천</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.key}>
                <tr className={row.note ? undefined : 'border-b border-[var(--border-subtle)]'}>
                  <th scope="row" className={cn(CELL, 'font-medium text-[var(--text-primary)]')}>{row.label}</th>
                  {!sharedRange && <td className={CELL}>{row.range}</td>}
                  <td className={CELL}>
                    <Dates>
                      <div>{row.days}</div>
                      <div className="text-[var(--text-muted)]">{row.includedDates}</div>
                    </Dates>
                  </td>
                  <td className={CELL}><Dates>{row.missing}</Dates></td>
                  {!sharedSources && <td className={CELL}>{row.sources}</td>}
                </tr>
                {row.note && <NoteRow note={row.note} columnCount={columnCount} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SnapshotBreakdownTable({ rows }: { rows: readonly SnapshotRow[] }) {
  const sharedAsOf = sharedFact(rows, (row) => row.asOf);
  const sharedSources = sharedFact(rows, (row) => row.sources);
  const columnCount = 1 + (sharedAsOf ? 0 : 1) + (sharedSources ? 0 : 1);

  return (
    <section className="mt-3 first:mt-0">
      <h4 className="font-semibold text-[var(--text-primary)]">시점 스냅샷 근거</h4>
      <p className="mb-1 text-[var(--text-muted)]">집계 기간이 아니라 읽은 시점이 근거입니다.</p>
      <SharedFacts facts={[['기준시점', sharedAsOf], ['원천', sharedSources]]} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
              <th scope="col" className={HEAD}>값</th>
              {!sharedAsOf && <th scope="col" className={HEAD}>기준시점</th>}
              {!sharedSources && <th scope="col" className={HEAD}>원천</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.key}>
                <tr className={row.note ? undefined : 'border-b border-[var(--border-subtle)]'}>
                  <th scope="row" className={cn(CELL, 'font-medium text-[var(--text-primary)]')}>{row.label}</th>
                  {!sharedAsOf && <td className={CELL}>{row.asOf}</td>}
                  {!sharedSources && <td className={CELL}>{row.sources}</td>}
                </tr>
                {row.note && <NoteRow note={row.note} columnCount={columnCount} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * One section-level ⓘ standing for every value in that section.
 *
 * The amendment allows a common explanation only where the bases truly match,
 * and on this page they do not — two cards in the same row can report
 * different windows and different sources. So this never states a single
 * shared basis: it prints one row per value and hoists only the facts every
 * row actually agrees on.
 */
/**
 * The panel's worst published state, which is what the ⓘ shows.
 *
 * A header with six values is as measured as its least measured one: saying
 * "complete" while one card is blank would be the caption problem again, in
 * colour. Nothing published at all stays neutral — an absent basis is not a
 * claim about the data.
 */
function disclosureTone(entries: readonly BasisBreakdownEntry[]): DisclosureTone {
  let seen = false;
  let tone: DisclosureTone = 'neutral';
  for (const entry of entries) {
    const basis = entry.basis;
    if (!basis) continue;
    seen = true;
    if (basis.kind !== 'period') continue;
    const status = periodBasisStatus(basis);
    if (status === 'empty' || status === 'unverified') return 'absent';
    if (status === 'partial') tone = 'partial';
  }
  return seen ? tone : 'neutral';
}

export function DashboardBasisDisclosure({
  label,
  entries,
  meaning,
  note,
  tone,
  className,
}: {
  label: string;
  entries: readonly BasisBreakdownEntry[];
  /**
   * Provenance the basis map does not carry — when the panel was observed, and
   * what the provider published for itself. It is evidence, not a value, which
   * is why it reads here rather than across the header.
   */
  /**
   * What the panel's numbers mean — how a grade is decided, what a step counts,
   * which rows a ranking admits. The ⓘ answers two questions and this is the
   * first: a reader who does not know what 경제점수 is cannot use a state
   * sentence about it.
   */
  meaning?: ReactNode;
  note?: string | null;
  /**
   * For a panel whose state its published bases do not carry. The Wing funnel
   * knows it collected nothing before any basis says so, and a `neutral` ⓘ over
   * five dashes would be the caption problem inverted — silent about the one
   * thing the reader needs.
   */
  tone?: DisclosureTone;
  className?: string;
}) {
  const { periodRows, snapshotRows } = splitBreakdown(entries);
  const empty = periodRows.length === 0 && snapshotRows.length === 0;
  // The affordance is always here. It used to disappear when a panel published
  // no basis — exactly when the panel is a row of dashes and the reader has
  // most to ask — and once the captions came off, that left nothing at all
  // explaining a blank card.

  return (
    <InfoDisclosure
      label={label}
      // The affordance carries the panel's state, so a header needs no words
      // for it: grey when every value is measured, amber when some window is
      // short, red when nothing was. That is the whole reason a panel can drop
      // its `부분 10/11일` and `최근 30일` captions and still say what it is.
      tone={tone ?? disclosureTone(entries)}
      // DESIGN.md asks for a 40px desktop icon target, and a 40px box inside a
      // `py-1.5` header sets the header's height — the affordance was making
      // every panel header 53px tall for 20px of title. The target is kept and
      // taken out of the layout instead: a 16px box with a 40px hit area
      // centred on it through `::after`, which occupies no space.
      className={cn(
        'relative h-4 w-4',
        "after:absolute after:left-1/2 after:top-1/2 after:h-10 after:w-10 after:content-['']",
        'after:-translate-x-1/2 after:-translate-y-1/2',
        className,
      )}
      iconClassName="h-4 w-4"
      // A month of dates per row needs the room; it still scrolls inside its
      // own box rather than pushing the page around.
      contentClassName="max-h-[min(34rem,70vh)] max-w-[min(40rem,calc(100vw-2rem))]"
    >
      {meaning && (
        <section className="mb-2">
          <h4 className="font-semibold text-[var(--text-primary)]">이 패널이 말하는 것</h4>
          <div className="mt-0.5 text-[var(--text-secondary)]">{meaning}</div>
        </section>
      )}
      {periodRows.length > 0 && <PeriodBreakdownTable rows={periodRows} />}
      {snapshotRows.length > 0 && <SnapshotBreakdownTable rows={snapshotRows} />}
      {empty && !note && (
        <p className="text-[var(--text-muted)]">
          아직 수집된 값이 없습니다. 이 패널의 수집을 실행하면 근거가 여기에 표시됩니다.
        </p>
      )}
      {note && (
        <p className={cn('text-[var(--text-muted)]', !empty && 'mt-2 border-t border-[var(--border-subtle)] pt-2')}>
          {note}
        </p>
      )}
    </InfoDisclosure>
  );
}
